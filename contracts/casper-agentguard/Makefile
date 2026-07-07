prepare:
	rustup target add wasm32-unknown-unknown
	rustup component add rust-src

build-contract:
	cd contract && cargo build -Z build-std=core,alloc --release --target wasm32-unknown-unknown
	wasm-strip contract/target/wasm32-unknown-unknown/release/casper_agentguard.wasm 2>/dev/null | true

clean:
	cd contract && cargo clean
