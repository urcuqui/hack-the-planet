.PHONY: help up down restart build logs ps health deploy clean

GAME_PORT ?= 8080
# Remote target for `make deploy`, e.g. VM=debian@192.168.56.10
VM ?=
REMOTE_DIR ?= ~/hack-the-planet

help:
	@echo "HACK THE PLANET — game server"
	@echo ""
	@echo "make up           Build and start the server in the background"
	@echo "make down         Stop the server"
	@echo "make restart      Rebuild and restart"
	@echo "make logs         Tail logs"
	@echo "make ps           Show service status"
	@echo "make health       Check that the game answers on port $(GAME_PORT)"
	@echo "make deploy VM=user@host   Copy the game to a VM and start it there"
	@echo "make clean        Stop and remove the image"

build:
	docker compose build

up:
	GAME_PORT=$(GAME_PORT) docker compose up --build -d

down:
	docker compose down

restart: down up

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

health:
	@curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:$(GAME_PORT)/ || (echo "Game server not reachable on port $(GAME_PORT)"; exit 1)

deploy:
	@if [ -z "$(VM)" ]; then echo "Usage: make deploy VM=user@host [REMOTE_DIR=~/hack-the-planet]"; exit 2; fi
	ssh $(VM) "mkdir -p $(REMOTE_DIR)"
	rsync -az --delete \
	  --exclude .git --exclude node_modules --exclude .DS_Store --exclude '*.gif' \
	  ./ $(VM):$(REMOTE_DIR)/
	ssh -t $(VM) "cd $(REMOTE_DIR) && ./run_lab.sh"

clean:
	docker compose down --rmi local
