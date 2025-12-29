#!/bin/bash

# Script para monitorar logs do servidor em tempo real

cd "$(dirname "$0")"

echo "📊 Monitorando logs do servidor NitroPing em tempo real..."
echo "Pressione Ctrl+C para parar"
echo "=========================================="
echo ""

# Tenta ler do arquivo de log, se não existir, mostra mensagem
if [ -f "server.log" ]; then
  tail -f server.log
else
  echo "⚠️  Arquivo server.log não encontrado."
  echo "💡 Os logs estão sendo exibidos no console do servidor."
  echo ""
  echo "Para ver os logs, execute o servidor em outro terminal:"
  echo "  bun run dev"
  echo ""
  echo "Ou configure o servidor para salvar logs em arquivo."
fi

