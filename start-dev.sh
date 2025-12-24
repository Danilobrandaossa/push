#!/bin/bash

# Script para iniciar o servidor de desenvolvimento com logs visíveis
cd "$(dirname "$0")"

echo "🚀 Iniciando servidor NitroPing..."
echo "📝 Logs serão exibidos neste terminal"
echo "🌐 Servidor acessível em:"
echo "   - Local: http://localhost:3000"
echo "   - Rede local: http://192.168.0.147:3000"
echo ""
echo "Pressione Ctrl+C para parar o servidor"
echo "=========================================="
echo ""

HOST=0.0.0.0 bun run dev

