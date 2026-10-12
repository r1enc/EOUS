use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const SERVICE: &str = "com.r1enc.eous.web-search-credential.v1";
const TARGET: &str = "com.r1enc.eous/web-search-credential/v1/tavily";
const PERSISTENCE: &str = "Local";
const ENDPOINT: &str = "https://api.tavily.com/search";
const MAX_BLOB_BYTES: usize = 5 * 512;
const MAX_RESPONSE_BYTES: usize = 128 * 1024;
const INVALID_CREDENTIAL: &str = "SEARCH_CREDENTIAL_INVALID";
const CREDENTIAL_UNAVAILABLE: &str = "SEARCH_CREDENTIAL_UNAVAILABLE";
const NOT_CONFIGURED: &str = "SEARCH_NOT_CONFIGURED";
const INVALID_QUERY: &str = "SEARCH_INVALID_QUERY";
const TRANSPORT_FAILED: &str = "SEARCH_TRANSPORT_FAILED";
const INVALID_RESPONSE: &str = "SEARCH_INVALID_RESPONSE";

static OPERATIONS: OnceLock<Mutex<()>> = OnceLock::new();

enum CredentialRead {
    Missing,
    Found(String),
    Corrupt,
}

trait CredentialBackend {
    fn get(&self) -> Result<CredentialRead, ()>;
    fn set(&self, payload: &str) -> Result<(), ()>;
    fn remove(&self) -> Result<(), ()>;
}

struct NativeBackend;

fn with_lock<T>(operation: impl FnOnce() -> Result<T, &'static str>) -> Result<T, String> {
    let _guard = OPERATIONS
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| CREDENTIAL_UNAVAILABLE.to_string())?;
    operation().map_err(str::to_string)
}

fn valid_key(key: &str) -> bool {
    !key.trim().is_empty() && !key.chars().any(char::is_control)
}

fn encode_key(key: &str) -> Result<String, &'static str> {
    if !valid_key(key) {
        return Err(INVALID_CREDENTIAL);
    }
    let payload = json!({"v": 1, "value": key}).to_string();
    if payload.encode_utf16().count() * 2 > MAX_BLOB_BYTES {
        return Err(INVALID_CREDENTIAL);
    }
    Ok(payload)
}

fn decode_key(payload: &str) -> Option<String> {
    if payload.encode_utf16().count() * 2 > MAX_BLOB_BYTES {
        return None;
    }
    let value: Value = serde_json::from_str(payload).ok()?;
    let fields = value.as_object()?;
    if fields.len() != 2 || fields.get("v")?.as_u64()? != 1 {
        return None;
    }
    let key = fields.get("value")?.as_str()?;
    valid_key(key).then(|| key.to_string())
}

fn status_with(backend: &impl CredentialBackend) -> Result<&'static str, &'static str> {
    match backend.get().map_err(|_| CREDENTIAL_UNAVAILABLE)? {
        CredentialRead::Missing => Ok("not_configured"),
        CredentialRead::Corrupt => Ok("invalid"),
        CredentialRead::Found(payload) => Ok(if decode_key(&payload).is_some() {
            "configured"
        } else {
            "invalid"
        }),
    }
}

fn key_with(backend: &impl CredentialBackend) -> Result<String, &'static str> {
    match backend.get().map_err(|_| CREDENTIAL_UNAVAILABLE)? {
        CredentialRead::Missing => Err(NOT_CONFIGURED),
        CredentialRead::Corrupt => Err(CREDENTIAL_UNAVAILABLE),
        CredentialRead::Found(payload) => decode_key(&payload).ok_or(CREDENTIAL_UNAVAILABLE),
    }
}

fn set_with(backend: &impl CredentialBackend, key: &str) -> Result<(), &'static str> {
    let payload = encode_key(key)?;
    backend.set(&payload).map_err(|_| CREDENTIAL_UNAVAILABLE)
}

fn remove_with(backend: &impl CredentialBackend) -> Result<(), &'static str> {
    backend.remove().map_err(|_| CREDENTIAL_UNAVAILABLE)
}

#[tauri::command]
pub fn get_web_search_credential_status() -> Result<String, String> {
    with_lock(|| status_with(&NativeBackend).map(str::to_string))
}

#[tauri::command]
pub fn set_web_search_credential(key: String) -> Result<(), String> {
    encode_key(&key).map_err(str::to_string)?;
    with_lock(|| set_with(&NativeBackend, &key))
}

#[tauri::command]
pub fn remove_web_search_credential() -> Result<(), String> {
    with_lock(|| remove_with(&NativeBackend))
}

fn validated_query(query: &str) -> Result<&str, &'static str> {
    let trimmed = query.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 400 || trimmed.chars().any(char::is_control)
    {
        return Err(INVALID_QUERY);
    }
    Ok(trimmed)
}

fn search_body(query: &str) -> Value {
    json!({
        "query": query,
        "search_depth": "basic",
        "max_results": 5,
        "include_answer": false,
        "include_raw_content": false,
        "include_images": false,
        "auto_parameters": false
    })
}

fn client() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| TRANSPORT_FAILED)
}

fn request(
    client: &reqwest::Client,
    query: &str,
    key: &str,
) -> Result<reqwest::Request, &'static str> {
    client
        .post(ENDPOINT)
        .bearer_auth(key)
        .json(&search_body(query))
        .build()
        .map_err(|_| TRANSPORT_FAILED)
}

fn limited(value: Option<&str>, max: usize) -> String {
    value.unwrap_or("").chars().take(max).collect()
}

fn project_response(body: &[u8]) -> Result<Value, &'static str> {
    let value: Value = serde_json::from_slice(body).map_err(|_| INVALID_RESPONSE)?;
    let results = value
        .get("results")
        .and_then(Value::as_array)
        .ok_or(INVALID_RESPONSE)?;
    let projected: Vec<Value> = results
        .iter()
        .take(5)
        .map(|item| {
            json!({
                "title": limited(item.get("title").and_then(Value::as_str), 250),
                "url": limited(item.get("url").and_then(Value::as_str), 2048),
                "content": limited(item.get("content").and_then(Value::as_str), 600)
            })
        })
        .collect();
    Ok(json!({"results": projected}))
}

#[tauri::command]
pub async fn search_web(query: String) -> Result<Value, String> {
    let query = validated_query(&query).map_err(str::to_string)?;
    // Credential lock is released before network I/O.
    let key = with_lock(|| key_with(&NativeBackend))?;
    let client = client().map_err(str::to_string)?;
    let request = request(&client, query, &key).map_err(str::to_string)?;
    let mut response = client
        .execute(request)
        .await
        .map_err(|_| TRANSPORT_FAILED.to_string())?;
    if !response.status().is_success() {
        return Err(TRANSPORT_FAILED.to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| TRANSPORT_FAILED.to_string())?
    {
        if chunk.len() > MAX_RESPONSE_BYTES.saturating_sub(body.len()) {
            return Err(INVALID_RESPONSE.to_string());
        }
        body.extend_from_slice(&chunk);
    }
    project_response(&body).map_err(str::to_string)
}

#[cfg(windows)]
impl NativeBackend {
    fn entry() -> Result<keyring_core::Entry, ()> {
        use keyring_core::api::CredentialStoreApi;
        let store = windows_native_keyring_store::Store::new().map_err(|_| ())?;
        let modifiers =
            std::collections::HashMap::from([("target", TARGET), ("persistence", PERSISTENCE)]);
        store
            .build(SERVICE, "tavily", Some(&modifiers))
            .map_err(|_| ())
    }
}

#[cfg(windows)]
impl CredentialBackend for NativeBackend {
    fn get(&self) -> Result<CredentialRead, ()> {
        match Self::entry()?.get_password() {
            Ok(payload) => Ok(CredentialRead::Found(payload)),
            Err(keyring_core::Error::NoEntry) => Ok(CredentialRead::Missing),
            Err(keyring_core::Error::BadEncoding(_)) => Ok(CredentialRead::Corrupt),
            Err(_) => Err(()),
        }
    }

    fn set(&self, payload: &str) -> Result<(), ()> {
        Self::entry()?.set_password(payload).map_err(|_| ())
    }

    fn remove(&self) -> Result<(), ()> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(_) => Err(()),
        }
    }
}

#[cfg(not(windows))]
impl CredentialBackend for NativeBackend {
    fn get(&self) -> Result<CredentialRead, ()> {
        Err(())
    }
    fn set(&self, _: &str) -> Result<(), ()> {
        Err(())
    }
    fn remove(&self) -> Result<(), ()> {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Fake(Mutex<Option<String>>);
    impl CredentialBackend for Fake {
        fn get(&self) -> Result<CredentialRead, ()> {
            Ok(match self.0.lock().unwrap().clone() {
                Some(payload) => CredentialRead::Found(payload),
                None => CredentialRead::Missing,
            })
        }
        fn set(&self, payload: &str) -> Result<(), ()> {
            *self.0.lock().unwrap() = Some(payload.to_string());
            Ok(())
        }
        fn remove(&self) -> Result<(), ()> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    #[test]
    fn credential_lifecycle_is_fixed_and_status_only() {
        assert_eq!(TARGET, "com.r1enc.eous/web-search-credential/v1/tavily");
        assert_eq!(SERVICE, "com.r1enc.eous.web-search-credential.v1");
        assert_eq!(PERSISTENCE, "Local");
        let fake = Fake::default();
        assert_eq!(status_with(&fake), Ok("not_configured"));
        set_with(&fake, "synthetic-one").unwrap();
        assert_eq!(status_with(&fake), Ok("configured"));
        assert_eq!(key_with(&fake), Ok("synthetic-one".to_string()));
        set_with(&fake, "synthetic-two").unwrap();
        assert_eq!(key_with(&fake), Ok("synthetic-two".to_string()));
        *fake.0.lock().unwrap() = Some("broken".into());
        assert_eq!(status_with(&fake), Ok("invalid"));
        assert_eq!(key_with(&fake), Err(CREDENTIAL_UNAVAILABLE));
        remove_with(&fake).unwrap();
        remove_with(&fake).unwrap();
        assert_eq!(key_with(&fake), Err(NOT_CONFIGURED));
        let _ = CredentialRead::Corrupt;
    }

    #[test]
    fn keys_and_queries_are_bounded() {
        assert_eq!(encode_key("  "), Err(INVALID_CREDENTIAL));
        assert_eq!(encode_key("a\nb"), Err(INVALID_CREDENTIAL));
        assert_eq!(encode_key(&"x".repeat(2000)), Err(INVALID_CREDENTIAL));
        assert_eq!(validated_query(" "), Err(INVALID_QUERY));
        assert_eq!(validated_query("a\rb"), Err(INVALID_QUERY));
        assert_eq!(validated_query(&"x".repeat(401)), Err(INVALID_QUERY));
        assert_eq!(validated_query("  exact words  "), Ok("exact words"));
    }

    #[test]
    fn request_has_only_fixed_endpoint_and_basic_body() {
        assert_eq!(ENDPOINT, "https://api.tavily.com/search");
        let client = client().unwrap();
        let built = request(&client, "topic", "synthetic-key").unwrap();
        assert_eq!(built.url().as_str(), ENDPOINT);
        assert_eq!(built.method(), reqwest::Method::POST);
        assert_eq!(built.headers()["authorization"], "Bearer synthetic-key");
        assert!(!built.url().as_str().contains("synthetic-key"));
        let body = built.body().unwrap().as_bytes().unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(body).unwrap(),
            search_body("topic")
        );
        assert_eq!(MAX_RESPONSE_BYTES, 128 * 1024);
    }

    #[test]
    fn response_projection_ignores_metadata_and_rejects_malformed_data() {
        let value = project_response(br#"{"results":[{"title":"A","url":"https://a.test","content":"B","raw_content":"private"}],"answer":"ignored"}"#).unwrap();
        assert_eq!(
            value,
            json!({"results":[{"title":"A","url":"https://a.test","content":"B"}]})
        );
        assert!(!value.to_string().contains("private"));
        assert_eq!(project_response(b"broken"), Err(INVALID_RESPONSE));
        assert_eq!(project_response(br#"{"wrong":[]}"#), Err(INVALID_RESPONSE));
    }
}
