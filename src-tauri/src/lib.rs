pub mod commands;
pub mod pdf;

/// MonaPDFsa Tauri 애플리케이션 진입점 및 플러그인/IPC 핸들러 초기화 함수
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 파일 시스템 및 네이티브 다이얼로그(열기/저장) 플러그인 등록
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // 프론트엔드 React와 통신할 IPC 커맨드 핸들러 등록
        .invoke_handler(tauri::generate_handler![
            commands::read_pdf_file,
            commands::cmd_pdf_merge,
            commands::cmd_pdf_split,
            commands::cmd_pdf_organize_and_export,
            commands::cmd_pdf_apply_redactions,
            commands::save_file_bytes,
        ])
        // 디버그 빌드 시 로깅 플러그인 활성화
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 애플리케이션 실행 중 오류가 발생했습니다.");
}
