use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};

const SERVICE: &str = "com.r1enc.eous.provider-credential.v1";
const TARGET_PREFIX: &str = "com.r1enc.eous/provider-credential/v1/";
const PERSISTENCE: &str = "Local";
const MAX_BLOB_BYTES: usize = 5 * 512;
const INVALID: &str = "Provider credential is invalid";
const UNAVAILABLE: &str = "Provider credential storage is unavailable";

static OPERATIONS: OnceLock<Mutex<()>> = OnceLock::new();

trait CredentialBackend {
    fn get(&self, provider_id: &str, target: &str) -> Result<CredentialRead, ()>;
    fn set(&self, provider_id: &str, target: &str, payload: &str) -> Result<(), ()>;
    fn remove(&self, provider_id: &str, target: &str) -> Result<(), ()>;
}

enum CredentialRead {
    Missing,
    Found(String),
    Corrupt,
}

struct NativeBackend;

fn target_for(provider_id: &str) -> Result<String, &'static str> {
    match provider_id {
        "openai" | "gemini" | "groq" => Ok(format!("{TARGET_PREFIX}{provider_id}")),
        _ => Err(INVALID),
    }
}

fn valid_secret(value: &str) -> bool {
    !value.trim().is_empty() && !value.contains(['\r', '\n'])
}

fn encode_payload(kind: &str, value: &str) -> Result<String, &'static str> {
    if !matches!(kind, "apiKey" | "token") || !valid_secret(value) {
        return Err(INVALID);
    }
    let payload = json!({"v": 1, "kind": kind, "value": value}).to_string();
    // The native backend writes passwords as UTF-16LE without a terminator.
    if payload.encode_utf16().count() * 2 > MAX_BLOB_BYTES {
        return Err(INVALID);
    }
    Ok(payload)
}

fn decode_payload(payload: &str) -> Option<(String, String)> {
    let data: Value = serde_json::from_str(payload).ok()?;
    let fields = data.as_object()?;
    if fields.len() != 3 || fields.get("v")?.as_u64()? != 1 {
        return None;
    }
    let kind = fields.get("kind")?.as_str()?;
    let value = fields.get("value")?.as_str()?;
    if !matches!(kind, "apiKey" | "token") || !valid_secret(value) {
        return None;
    }
    if payload.encode_utf16().count() * 2 > MAX_BLOB_BYTES {
        return None;
    }
    Some((kind.to_string(), value.to_string()))
}

fn with_lock<T>(operation: impl FnOnce() -> Result<T, &'static str>) -> Result<T, String> {
    let _guard = OPERATIONS
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| UNAVAILABLE.to_string())?;
    operation().map_err(str::to_string)
}

fn get_with(backend: &impl CredentialBackend, provider_id: &str) -> Result<Value, &'static str> {
    let target = target_for(provider_id)?;
    match backend.get(provider_id, &target).map_err(|_| UNAVAILABLE)? {
        CredentialRead::Missing => Ok(json!({"state": "missing"})),
        CredentialRead::Corrupt => Ok(json!({"state": "invalid"})),
        CredentialRead::Found(payload) => match decode_payload(&payload) {
            Some((kind, value)) => Ok(json!({"state": "found", "kind": kind, "value": value})),
            None => Ok(json!({"state": "invalid"})),
        },
    }
}

fn set_with(
    backend: &impl CredentialBackend,
    provider_id: &str,
    kind: &str,
    value: &str,
) -> Result<(), &'static str> {
    let target = target_for(provider_id)?;
    let payload = encode_payload(kind, value)?;
    backend
        .set(provider_id, &target, &payload)
        .map_err(|_| UNAVAILABLE)
}

fn remove_with(backend: &impl CredentialBackend, provider_id: &str) -> Result<(), &'static str> {
    let target = target_for(provider_id)?;
    backend
        .remove(provider_id, &target)
        .map_err(|_| UNAVAILABLE)
}

#[tauri::command]
pub fn get_provider_credential(provider_id: String) -> Result<Value, String> {
    target_for(&provider_id).map_err(str::to_string)?;
    with_lock(|| get_with(&NativeBackend, &provider_id))
}

#[tauri::command]
pub fn set_provider_credential(
    provider_id: String,
    kind: String,
    value: String,
) -> Result<(), String> {
    target_for(&provider_id).map_err(str::to_string)?;
    encode_payload(&kind, &value).map_err(str::to_string)?;
    with_lock(|| set_with(&NativeBackend, &provider_id, &kind, &value))
}

#[tauri::command]
pub fn remove_provider_credential(provider_id: String) -> Result<(), String> {
    target_for(&provider_id).map_err(str::to_string)?;
    with_lock(|| remove_with(&NativeBackend, &provider_id))
}

#[cfg(windows)]
impl NativeBackend {
    fn entry(provider_id: &str, target: &str) -> Result<keyring_core::Entry, ()> {
        use keyring_core::api::CredentialStoreApi;
        let store = windows_native_keyring_store::Store::new().map_err(|_| ())?;
        let modifiers =
            std::collections::HashMap::from([("target", target), ("persistence", PERSISTENCE)]);
        store
            .build(SERVICE, provider_id, Some(&modifiers))
            .map_err(|_| ())
    }
}

#[cfg(windows)]
impl CredentialBackend for NativeBackend {
    fn get(&self, provider_id: &str, target: &str) -> Result<CredentialRead, ()> {
        match Self::entry(provider_id, target)?.get_password() {
            Ok(payload) => Ok(CredentialRead::Found(payload)),
            Err(keyring_core::Error::NoEntry) => Ok(CredentialRead::Missing),
            Err(keyring_core::Error::BadEncoding(_)) => Ok(CredentialRead::Corrupt),
            Err(_) => Err(()),
        }
    }

    fn set(&self, provider_id: &str, target: &str, payload: &str) -> Result<(), ()> {
        Self::entry(provider_id, target)?
            .set_password(payload)
            .map_err(|_| ())
    }

    fn remove(&self, provider_id: &str, target: &str) -> Result<(), ()> {
        match Self::entry(provider_id, target)?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(_) => Err(()),
        }
    }
}

#[cfg(not(windows))]
impl CredentialBackend for NativeBackend {
    fn get(&self, _: &str, _: &str) -> Result<CredentialRead, ()> {
        Err(())
    }
    fn set(&self, _: &str, _: &str, _: &str) -> Result<(), ()> {
        Err(())
    }
    fn remove(&self, _: &str, _: &str) -> Result<(), ()> {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[derive(Default)]
    struct Fake(Mutex<HashMap<String, String>>);

    impl CredentialBackend for Fake {
        fn get(&self, _: &str, target: &str) -> Result<CredentialRead, ()> {
            Ok(match self.0.lock().unwrap().get(target) {
                Some(value) => CredentialRead::Found(value.clone()),
                None => CredentialRead::Missing,
            })
        }
        fn set(&self, _: &str, target: &str, payload: &str) -> Result<(), ()> {
            self.0.lock().unwrap().insert(target.into(), payload.into());
            Ok(())
        }
        fn remove(&self, _: &str, target: &str) -> Result<(), ()> {
            self.0.lock().unwrap().remove(target);
            Ok(())
        }
    }

    #[test]
    fn targets_are_fixed_and_local_is_requested() {
        for id in ["openai", "gemini", "groq"] {
            assert_eq!(target_for(id).unwrap(), format!("{TARGET_PREFIX}{id}"));
        }
        assert!(target_for("other").is_err());
        assert_eq!(PERSISTENCE, "Local");
        assert_eq!(SERVICE, "com.r1enc.eous.provider-credential.v1");
    }

    #[test]
    fn payloads_round_trip_and_reject_invalid_data() {
        for kind in ["apiKey", "token"] {
            let encoded = encode_payload(kind, "synthetic-value").unwrap();
            assert_eq!(
                decode_payload(&encoded),
                Some((kind.into(), "synthetic-value".into()))
            );
        }
        for payload in [
            "not-json",
            r#"{"v":2,"kind":"apiKey","value":"x"}"#,
            r#"{"v":1,"kind":"other","value":"x"}"#,
            r#"{"v":1,"kind":"apiKey","value":" "}"#,
            r#"{"v":1,"kind":"apiKey","value":"x\n"}"#,
        ] {
            assert_eq!(decode_payload(payload), None);
        }
        assert!(encode_payload("apiKey", " ").is_err());
        assert!(encode_payload("token", "x\r").is_err());
        assert!(encode_payload("other", "x").is_err());
        assert!(encode_payload("apiKey", &"🔒".repeat(700)).is_err());
    }

    #[test]
    fn commands_distinguish_missing_found_invalid_and_delete() {
        let fake = Fake::default();
        assert_eq!(
            get_with(&fake, "openai").unwrap(),
            json!({"state":"missing"})
        );
        set_with(&fake, "openai", "apiKey", "synthetic-value").unwrap();
        assert_eq!(
            get_with(&fake, "openai").unwrap(),
            json!({"state":"found","kind":"apiKey","value":"synthetic-value"})
        );
        fake.0
            .lock()
            .unwrap()
            .insert(target_for("openai").unwrap(), "broken".into());
        assert_eq!(
            get_with(&fake, "openai").unwrap(),
            json!({"state":"invalid"})
        );
        remove_with(&fake, "openai").unwrap();
        remove_with(&fake, "openai").unwrap();
        assert_eq!(
            get_with(&fake, "openai").unwrap(),
            json!({"state":"missing"})
        );
    }

    struct Failing;
    impl CredentialBackend for Failing {
        fn get(&self, _: &str, _: &str) -> Result<CredentialRead, ()> {
            Err(())
        }
        fn set(&self, _: &str, _: &str, _: &str) -> Result<(), ()> {
            Err(())
        }
        fn remove(&self, _: &str, _: &str) -> Result<(), ()> {
            Err(())
        }
    }

    #[test]
    fn backend_failure_is_fixed_and_never_exposes_a_secret() {
        assert_eq!(get_with(&Failing, "openai"), Err(UNAVAILABLE));
        assert_eq!(
            set_with(&Failing, "openai", "apiKey", "synthetic-value"),
            Err(UNAVAILABLE)
        );
        assert_eq!(remove_with(&Failing, "openai"), Err(UNAVAILABLE));
    }

    struct Corrupt;
    impl CredentialBackend for Corrupt {
        fn get(&self, _: &str, _: &str) -> Result<CredentialRead, ()> {
            Ok(CredentialRead::Corrupt)
        }
        fn set(&self, _: &str, _: &str, _: &str) -> Result<(), ()> {
            Err(())
        }
        fn remove(&self, _: &str, _: &str) -> Result<(), ()> {
            Err(())
        }
    }

    #[test]
    fn invalid_native_encoding_is_not_reported_as_missing() {
        assert_eq!(
            get_with(&Corrupt, "openai").unwrap(),
            json!({"state":"invalid"})
        );
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Uses the current Windows user's real Credential Manager with a synthetic target"]
    fn windows_credential_manager_smoke() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let target = format!(
            "com.r1enc.eous/provider-credential-test/v1/{}-{nonce}",
            std::process::id()
        );
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                if let Ok(entry) = NativeBackend::entry("test", &self.0) {
                    let _ = entry.delete_credential();
                }
            }
        }
        let _cleanup = Cleanup(target.clone());

        let first = NativeBackend::entry("test", &target).unwrap();
        first.set_password("synthetic-one").unwrap();
        assert_eq!(first.get_attributes().unwrap()["persistence"], "Local");
        assert_eq!(
            NativeBackend::entry("test", &target)
                .unwrap()
                .get_password()
                .unwrap(),
            "synthetic-one"
        );
        first.set_password("synthetic-two").unwrap();
        let reopened = NativeBackend::entry("test", &target).unwrap();
        assert_eq!(reopened.get_password().unwrap(), "synthetic-two");
        reopened.delete_credential().unwrap();
        assert!(matches!(
            NativeBackend::entry("test", &target)
                .unwrap()
                .get_password(),
            Err(keyring_core::Error::NoEntry)
        ));
    }
}
