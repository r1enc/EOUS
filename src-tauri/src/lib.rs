mod provider_credentials;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            provider_credentials::get_provider_credential,
            provider_credentials::set_provider_credential,
            provider_credentials::remove_provider_credential
        ])
        .run(tauri::generate_context!())
        .expect("error while running EOUS");
}
