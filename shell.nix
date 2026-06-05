{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  # 1. 빌드할 때 필요한 도구들을 넣는 곳 (pkg-config 추가)
  nativeBuildInputs = with pkgs; [
    pkg-config
  ];

  # 2. 런타임 및 링크에 필요한 라이브러리 (openssl 추가)
  buildInputs = with pkgs; [
    cargo
    rustc
    rustfmt
    clippy
    rust-analyzer
    sqlx-cli
    sqlite
    openssl      # <-- OpenSSL 라이브러리 추가
  ];

  # 필요한 경우 환경 변수 설정
  shellHook = ''
    export RUST_SRC_PATH=${pkgs.rustPlatform.rustLibSrc}
    
    # Nix 환경에서 pkg-config가 OpenSSL을 확실히 찾을 수 있도록 경로 매핑
    export OPENSSL_DIR="${pkgs.openssl.dev}"
    export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
    export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
    export DATABASE_URL="sqlite://gacha.db"
    echo "🦀 Welcome to the Rust development environment! 🦀"
    rustc --version
  '';
}