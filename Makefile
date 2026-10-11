.PHONY: run

# Ставит зависимости при первом запуске и поднимает dev-сервер.
run: node_modules
	npm run dev

node_modules: package.json package-lock.json
	npm install
	@touch node_modules
