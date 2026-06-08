#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-container}"
# LAN resolver. The gateway (192.168.1.1) does not answer DNS, so apt in the
# build's RUN steps fails against it. The DNS must be set on the BUILDER —
# `container build --dns` is NOT propagated to RUN-step sandboxes.
BUILD_DNS="${BUILD_DNS:-192.168.1.53}"

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

# Recreate the buildkit builder with a working resolver. The builder also
# caches COPY layers aggressively (see CLAUDE.md), so a from-scratch builder
# guarantees a clean build.
"${CONTAINER_RUNTIME}" builder delete --force 2>/dev/null || true
"${CONTAINER_RUNTIME}" builder start --dns "${BUILD_DNS}" --cpus 2 --memory 4096MB

${CONTAINER_RUNTIME} build --dns "${BUILD_DNS}" -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | ${CONTAINER_RUNTIME} run -i ${IMAGE_NAME}:${TAG}"
