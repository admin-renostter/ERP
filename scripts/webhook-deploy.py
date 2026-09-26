#!/usr/bin/env python3
"""Webhook Deploy Script para VPS"""

from flask import Flask, request, jsonify
import os
import subprocess
import json
from datetime import datetime
from functools import wraps

app = Flask(__name__)

WEBHOOK_TOKEN = os.getenv('WEBHOOK_TOKEN', 'seu-token-aqui')
REPO_PATH = '/opt/renostter-erp'
LOG_FILE = '/var/log/webhook-deploy.log'

def log_message(message):
    """Log de mensagens"""
    timestamp = datetime.now().isoformat()
    log_entry = f"[{timestamp}] {message}\n"
    print(log_entry, end='')
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(log_entry)
    except:
        pass

def require_token(f):
    """Decorator para validar token de autenticação"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if token != WEBHOOK_TOKEN:
            log_message(f"❌ Acesso negado - Token inválido: {token[:10]}...")
            return jsonify({
                'success': False,
                'message': 'Unauthorized - Invalid token'
            }), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'webhook-deploy',
        'timestamp': datetime.now().isoformat()
    }), 200

@app.route('/webhook/deploy', methods=['POST'])
@require_token
def webhook_deploy():
    """Endpoint para receber requisições de deploy"""
    try:
        data = request.get_json()
        log_message(f"📨 Webhook recebido - Repository: {data.get('repository')}, Branch: {data.get('branch')}")
        
        if not data.get('action') == 'deploy':
            return jsonify({
                'success': False,
                'message': 'Invalid action'
            }), 400
        
        return execute_deploy(data)
        
    except Exception as e:
        log_message(f"❌ Erro ao processar webhook: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error: {str(e)}'
        }), 500

def execute_deploy(data):
    """Executa o deployment"""
    try:
        log_message(f"🚀 Iniciando deployment para {data.get('repository')} ({data.get('commit')[:7]})")
        
        if not os.path.exists(REPO_PATH):
            log_message(f"❌ Repositório não encontrado em {REPO_PATH}")
            return jsonify({
                'success': False,
                'message': f'Repository path not found: {REPO_PATH}'
            }), 404
        
        commands = [
            ('Git Pull', f'cd {REPO_PATH} && git pull origin main'),
            ('Docker Compose Stop', f'cd {REPO_PATH} && docker-compose stop nginx'),
            ('Docker Compose Build', f'cd {REPO_PATH} && docker-compose build nginx'),
            ('Docker Compose Up', f'cd {REPO_PATH} && docker-compose up -d nginx'),
            ('Status Check', f'cd {REPO_PATH} && docker-compose ps'),
        ]
        
        results = []
        for name, cmd in commands:
            log_message(f"  ⏳ Executando: {name}")
            try:
                output = subprocess.check_output(
                    cmd, 
                    shell=True, 
                    stderr=subprocess.STDOUT,
                    timeout=60,
                    text=True
                )
                log_message(f"  ✅ {name} concluído")
                results.append({
                    'step': name,
                    'success': True,
                    'output': output[:500]
                })
            except subprocess.TimeoutExpired:
                log_message(f"  ⏱️ {name} timeout")
                results.append({
                    'step': name,
                    'success': False,
                    'error': 'Command timeout'
                })
                break
            except subprocess.CalledProcessError as e:
                log_message(f"  ❌ {name} falhou: {e.output[:200]}")
                results.append({
                    'step': name,
                    'success': False,
                    'error': e.output[:200]
                })
        
        log_message(f"✅ Deployment concluído")
        return jsonify({
            'success': True,
            'message': 'Deployment completed',
            'commit': data.get('commit'),
            'timestamp': datetime.now().isoformat(),
            'steps': results
        }), 200
        
    except Exception as e:
        log_message(f"❌ Erro no deployment: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Deployment error: {str(e)}'
        }), 500

@app.route('/webhook/status', methods=['GET'])
def webhook_status():
    """Verificar status do último deployment"""
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'r') as f:
                lines = f.readlines()
                recent = ''.join(lines[-20:])
                return jsonify({
                    'status': 'ok',
                    'recent_logs': recent
                }), 200
        else:
            return jsonify({
                'status': 'ok',
                'message': 'No logs yet'
            }), 200
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    log_message("🚀 Webhook Deploy Server iniciando...")
    app.run(host='0.0.0.0', port=5000, debug=False)
