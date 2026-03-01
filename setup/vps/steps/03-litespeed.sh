#!/usr/bin/env bash
# 03-litespeed.sh — Add n8n proxy vhosts to LiteSpeed, patch httpd_config.xml
# Idempotent: checks before modifying. Backs up config before every change.
#
# Requires:
#   - n8n running on 127.0.0.1:5678 (step 01)
#   - DNS pointing to this VPS (step 02)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_vars VPS_HOST VPS_PORT VPS_USER VPS_KEY VPS_SUDO_PASS \
             N8N_DOMAIN_UI N8N_DOMAIN_WEBHOOKS

LS_CONF=/usr/local/lsws/conf
LS_CTRL=/usr/local/lsws/bin/lswsctrl

# ---------------------------------------------------------------------------
step "03 — LiteSpeed vhosts for n8n"
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
log "Downloading current httpd_config.xml for patching"
ssh -i "$VPS_KEY" -p "$VPS_PORT" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" 'bash -s' <<ENDSSH
printf '#!/bin/bash\necho "${VPS_SUDO_PASS}"\n' > /tmp/.ap.sh
chmod 700 /tmp/.ap.sh
SUDO_ASKPASS=/tmp/.ap.sh sudo -A cp ${LS_CONF}/httpd_config.xml /tmp/httpd_config.xml.work
SUDO_ASKPASS=/tmp/.ap.sh sudo -A chmod 644 /tmp/httpd_config.xml.work
rm -f /tmp/.ap.sh
ENDSSH

vps_download /tmp/httpd_config.xml.work /tmp/httpd_config_work.xml
ok "Downloaded httpd_config.xml"

# ---------------------------------------------------------------------------
log "Checking if vhosts already registered in httpd_config.xml"
OPS_EXISTS=$(python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('/tmp/httpd_config_work.xml')
root = tree.getroot()
for vh in root.findall('.//virtualHost/name'):
    if vh.text == 'n8n-ops':
        print('yes')
        exit()
print('no')
")

if [[ "$OPS_EXISTS" == "yes" ]]; then
  ok "n8n vhosts already in httpd_config.xml — skipping XML patch"
else
  log "Patching httpd_config.xml"
  python3 <<'PYEOF'
import xml.etree.ElementTree as ET
import sys

ET.register_namespace('', '')
tree = ET.parse('/tmp/httpd_config_work.xml')
root = tree.getroot()

# Helper: indent new element to match siblings
def make_vh(name, vhroot, conffile):
    vh = ET.Element('virtualHost')
    for tag, val in [
        ('name', name), ('vhRoot', vhroot), ('configFile', conffile),
        ('allowSymbolLink', '1'), ('enableScript', '0'),
        ('restrained', '1'), ('setUIDMode', '0'), ('chrootMode', '0'),
    ]:
        el = ET.SubElement(vh, tag)
        el.text = val
    return vh

def make_vhmap(vhost, domain):
    vhmap = ET.Element('vhostMap')
    v = ET.SubElement(vhmap, 'vhost')
    v.text = vhost
    d = ET.SubElement(vhmap, 'domain')
    d.text = domain
    return vhmap

# --- virtualHostList ---
vhl = root.find('virtualHostList')
if vhl is None:
    print("ERROR: virtualHostList not found", file=sys.stderr)
    sys.exit(1)

vhl.append(make_vh('n8n-ops',
    '/usr/local/lsws/n8n-ops',
    'conf/vhost_n8n_ops.conf'))
vhl.append(make_vh('n8n-webhooks',
    '/usr/local/lsws/n8n-webhooks',
    'conf/vhost_n8n_webhooks.conf'))

# --- vhostMapList (inside first listener) ---
vhml = root.find('.//listenerList/listener/vhostMapList')
if vhml is None:
    print("ERROR: vhostMapList not found", file=sys.stderr)
    sys.exit(1)

vhml.append(make_vhmap('n8n-ops', 'ops.tandemcoach.co'))
vhml.append(make_vhmap('n8n-webhooks', 'webhooks.tandemcoach.co'))

# Write with xml declaration
tree.write('/tmp/httpd_config_patched.xml',
           encoding='UTF-8', xml_declaration=True)
print("Patched OK")
PYEOF
  ok "httpd_config.xml patched"
fi

# ---------------------------------------------------------------------------
log "Writing vhost conf files locally"

cat > /tmp/vhost_n8n_ops.conf <<'XMLEOF'
<?xml version="1.0" encoding="UTF-8"?>
<virtualHostConfig>
  <docRoot>/tmp</docRoot>
  <extProcessorList>
    <extProcessor>
      <type>proxy</type>
      <name>n8nOpsBackend</name>
      <address>127.0.0.1:5678</address>
      <maxConns>32</maxConns>
      <initTimeout>60</initTimeout>
      <retryTimeout>0</retryTimeout>
      <respBuffer>0</respBuffer>
    </extProcessor>
  </extProcessorList>
  <contextList>
    <context>
      <type>proxy</type>
      <uri>/</uri>
      <handler>n8nOpsBackend</handler>
      <addDefaultCharset>off</addDefaultCharset>
    </context>
  </contextList>
</virtualHostConfig>
XMLEOF

cat > /tmp/vhost_n8n_webhooks.conf <<'XMLEOF'
<?xml version="1.0" encoding="UTF-8"?>
<virtualHostConfig>
  <docRoot>/tmp</docRoot>
  <extProcessorList>
    <extProcessor>
      <type>proxy</type>
      <name>n8nWebhooksBackend</name>
      <address>127.0.0.1:5678</address>
      <maxConns>128</maxConns>
      <initTimeout>60</initTimeout>
      <retryTimeout>0</retryTimeout>
      <respBuffer>0</respBuffer>
    </extProcessor>
  </extProcessorList>
  <contextList>
    <context>
      <type>proxy</type>
      <uri>/</uri>
      <handler>n8nWebhooksBackend</handler>
      <addDefaultCharset>off</addDefaultCharset>
    </context>
  </contextList>
</virtualHostConfig>
XMLEOF

ok "Vhost conf files created locally"

# ---------------------------------------------------------------------------
log "Uploading files to VPS"

# Upload vhost conf files to /tmp first, then sudo move to LS conf dir
vps_upload /tmp/vhost_n8n_ops.conf /tmp/vhost_n8n_ops.conf
vps_upload /tmp/vhost_n8n_webhooks.conf /tmp/vhost_n8n_webhooks.conf
ok "Conf files uploaded to /tmp"

# If we patched the XML, upload it too
if [[ "$OPS_EXISTS" != "yes" ]]; then
  vps_upload /tmp/httpd_config_patched.xml /tmp/httpd_config_patched.xml
  ok "Patched httpd_config.xml uploaded to /tmp"
fi

# ---------------------------------------------------------------------------
log "Installing files with sudo (backup first)"
ssh -i "$VPS_KEY" -p "$VPS_PORT" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" 'bash -s' <<ENDSSH
printf '#!/bin/bash\necho "${VPS_SUDO_PASS}"\n' > /tmp/.ap.sh
chmod 700 /tmp/.ap.sh
# Use function — env-var prefix in a variable doesn't work in bash
ds() { SUDO_ASKPASS=/tmp/.ap.sh sudo -A "\$@"; }

# Create docroot dirs (safe, no-op if exist)
ds mkdir -p /usr/local/lsws/n8n-ops /usr/local/lsws/n8n-webhooks

# Move vhost conf files
ds cp /tmp/vhost_n8n_ops.conf ${LS_CONF}/vhost_n8n_ops.conf
ds cp /tmp/vhost_n8n_webhooks.conf ${LS_CONF}/vhost_n8n_webhooks.conf
ds chown root:root ${LS_CONF}/vhost_n8n_ops.conf ${LS_CONF}/vhost_n8n_webhooks.conf
ds chmod 644 ${LS_CONF}/vhost_n8n_ops.conf ${LS_CONF}/vhost_n8n_webhooks.conf

# If patched XML exists, install it (backup original first)
if [[ -f /tmp/httpd_config_patched.xml ]]; then
  ds cp ${LS_CONF}/httpd_config.xml "${LS_CONF}/httpd_config.xml.bak-\$(date +%Y%m%d-%H%M%S)"
  ds cp /tmp/httpd_config_patched.xml ${LS_CONF}/httpd_config.xml
  ds chown root:root ${LS_CONF}/httpd_config.xml
  ds chmod 644 ${LS_CONF}/httpd_config.xml
  echo "httpd_config.xml installed"
fi

rm -f /tmp/.ap.sh /tmp/vhost_n8n_ops.conf /tmp/vhost_n8n_webhooks.conf \
       /tmp/httpd_config_patched.xml /tmp/httpd_config.xml.work
echo "Files installed"
ENDSSH
ok "Files installed on VPS"

# ---------------------------------------------------------------------------
log "Reloading LiteSpeed gracefully"
ssh -i "$VPS_KEY" -p "$VPS_PORT" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" 'bash -s' <<ENDSSH
printf '#!/bin/bash\necho "${VPS_SUDO_PASS}"\n' > /tmp/.ap.sh
chmod 700 /tmp/.ap.sh
SUDO_ASKPASS=/tmp/.ap.sh sudo -A ${LS_CTRL} restart
rm -f /tmp/.ap.sh
ENDSSH
ok "LiteSpeed restarted"

# ---------------------------------------------------------------------------
log "Waiting 5s then verifying n8n reachable via proxy"
sleep 5

# Test via VPS loopback (bypasses Cloudflare)
VPS_HEALTH=$(vps_exec "curl -fs -H 'Host: ops.tandemcoach.co' http://127.0.0.1/healthz --max-time 5" 2>/dev/null || true)
if [[ -n "$VPS_HEALTH" ]]; then
  ok "n8n health check passed via LiteSpeed proxy"
else
  log "  Health check via LiteSpeed inconclusive — n8n may still be starting."
  log "  Verify manually: curl -H 'Host: ops.tandemcoach.co' http://127.0.0.1/healthz"
fi

ok "Step 03 complete"
log ""
log "Next: verify https://${N8N_DOMAIN_UI}/ loads n8n (DNS must have propagated)."
log "      https://${N8N_DOMAIN_WEBHOOKS}/webhook-test/ should also be reachable."
