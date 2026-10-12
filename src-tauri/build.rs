fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_provider_credential",
            "set_provider_credential",
            "remove_provider_credential",
            "set_web_search_credential",
            "remove_web_search_credential",
            "get_web_search_credential_status",
            "search_web",
        ]),
    ))
    .expect("failed to build EOUS Tauri application");
}
