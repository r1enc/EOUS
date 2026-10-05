fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_provider_credential",
            "set_provider_credential",
            "remove_provider_credential",
        ]),
    ))
    .expect("failed to build EOUS Tauri application");
}
