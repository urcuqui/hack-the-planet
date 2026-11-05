#!/bin/bash
# HACK THE PLANET — VM/host deployment entrypoint (Debian/Ubuntu).
#
# Builds and starts the game server with Docker Compose so it keeps running in
# the background and comes back after a reboot. Installs Docker on
# Debian/Ubuntu if it is missing (set INSTALL_DOCKER=0 to skip that).
#
# Environment knobs:
#   GAME_PORT        Host port to publish (default: 8080).
#   INSTALL_DOCKER   1 (default) installs Docker on Debian/Ubuntu when missing.
set -euo pipefail

LAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_PORT="${GAME_PORT:-8080}"
INSTALL_DOCKER="${INSTALL_DOCKER:-1}"
OS_ID="unknown"
export GAME_PORT

echo "[*] Starting HACK THE PLANET game server..."

if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-unknown}"
fi

cd "$LAB_DIR"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

install_docker_debian() {
    echo "[*] Installing Docker from the Debian/Ubuntu repositories..."
    $SUDO apt-get update
    # Debian ships Compose v2 as docker-compose (bookworm+) and the plugin may
    # not exist in the distro repos, so try both.
    if ! $SUDO apt-get install -y docker.io docker-compose-plugin curl; then
        $SUDO apt-get install -y docker.io docker-compose curl
    fi
    $SUDO systemctl enable --now docker
}

if ! command -v docker >/dev/null 2>&1; then
    if [ "$INSTALL_DOCKER" = "1" ] && { [ "$OS_ID" = "debian" ] || [ "$OS_ID" = "ubuntu" ]; }; then
        install_docker_debian
    else
        echo "[!] Docker is not installed or is not in PATH."
        echo "    sudo apt update && sudo apt install -y docker.io docker-compose-plugin"
        echo "    sudo systemctl enable --now docker"
        exit 1
    fi
fi

# Make sure Docker starts on boot, so the container (restart: unless-stopped)
# comes back after the VM restarts.
if command -v systemctl >/dev/null 2>&1; then
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
fi

# Use sudo for docker if the current user cannot reach the daemon.
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
    if [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then
        DOCKER=($SUDO docker)
        echo "[*] Using sudo for Docker. To avoid it: sudo usermod -aG docker \$USER && newgrp docker"
    else
        echo "[!] Docker is installed, but the daemon is not reachable."
        echo "    sudo systemctl enable --now docker"
        exit 1
    fi
fi

if "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    COMPOSE=("${DOCKER[@]}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=($SUDO docker-compose)
else
    echo "[!] Docker Compose is not installed."
    echo "    sudo apt install -y docker-compose-plugin   (or: docker-compose)"
    exit 1
fi

echo "[*] Building and starting the container (port $GAME_PORT)..."
# Compose reads .env for ${GAME_PORT}; this also survives sudo dropping env vars.
echo "GAME_PORT=${GAME_PORT}" > "$LAB_DIR/.env"
"${COMPOSE[@]}" up --build -d

echo "[*] Waiting for the game server to answer..."
ok=0
for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${GAME_PORT}/" 2>/dev/null; then
        ok=1
        break
    fi
    sleep 1
done

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
if [ "$ok" = "1" ]; then
    echo "[+] Game server is running."
else
    echo "[!] The server did not answer yet; check: ${COMPOSE[*]} logs"
fi
echo "[*] On the VM:      http://localhost:${GAME_PORT}/"
[ -n "$IP" ] && echo "[*] From your LAN:  http://${IP}:${GAME_PORT}/"
echo "[*] Note: players' browsers load Three.js from cdnjs.cloudflare.com (internet needed on the client)."
echo
"${COMPOSE[@]}" ps

echo
echo "[*] Useful commands:"
echo "    ${COMPOSE[*]} logs -f    # tail logs"
echo "    ${COMPOSE[*]} restart    # restart the server"
echo "    ${COMPOSE[*]} down       # stop the server"
