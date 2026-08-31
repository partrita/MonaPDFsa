// Windows 릴리즈 빌드 실행 시 불필요한 콘솔 창이 뜨지 않도록 설정
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// MonaPDFsa 메인 바이너리 진입점
fn main() {
    app_lib::run();
}
