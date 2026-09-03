---
weight: 590
title: "Troubleshooting"
description: "Common issues and solutions when running Avalok"
icon: "troubleshoot"
---

# Troubleshooting

Common issues and how to resolve them, organized by area.

---

## WinRM Connections

### 401 - Authentication Failed

If you see `winrm create shell: http response error: 401` in the Avalok logs, the Windows machine is rejecting the credentials. This is almost always because Basic auth or unencrypted transport is not enabled.

**Step 1: Enable and configure WinRM on the Windows machine**

Run in an elevated PowerShell:

```powershell
winrm quickconfig -force
winrm set winrm/config/service/auth '@{Basic="true"}'
winrm set winrm/config/service '@{AllowUnencrypted="true"}'
Restart-Service WinRM
```

**Step 2: Verify the settings applied**

```powershell
winrm get winrm/config/service/auth
```

Confirm `Basic = true` is shown. If it still shows `false`, a Group Policy may be overriding it:

```powershell
gpresult /h gpreport.html
```

Open the HTML report and check under **Computer Configuration > Administrative Templates > Windows Components > Windows Remote Management > WinRM Service** for any policy forcing Basic auth off.

**Step 3: Test from the Linux machine**

Run from the machine where Avalok is running:

```bash
curl -v -u 'Administrator:yourpassword' \
  http://<windows-ip>:5985/wsman \
  -H "Content-Type: application/soap+xml;charset=UTF-8" \
  -d '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsmid="http://schemas.dmtf.org/wbem/wsman/identity/1/wsmanidentity.xsd"><s:Header/><s:Body><wsmid:Identify/></s:Body></s:Envelope>'
```

- **200 with XML** — WinRM is working. Check your Avalok service config.
- **401** — Auth still failing. Re-check the steps above.
- **Connection refused** — WinRM isn't running or firewall is blocking port 5985.
- **Timeout** — Firewall or wrong IP.

### Local Admin Account Issues

The local Administrator account may be disabled by default on some Windows installations:

```powershell
Get-LocalUser Administrator
```

If disabled, enable it:

```powershell
Enable-LocalUser -Name Administrator
```

Windows also blocks remote access for local accounts by default. Set this registry key:

```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" `
  -Name "LocalAccountTokenFilterPolicy" -Value 1 -PropertyType DWORD -Force
Restart-Service WinRM
```

### Using HTTPS Instead of HTTP

If Basic auth over HTTP is restricted by policy, use HTTPS instead. On the Windows machine:

```powershell
$cert = New-SelfSignedCertificate -DnsName (hostname) -CertStoreLocation Cert:\LocalMachine\My
winrm create winrm/config/Listener?Address=*+Transport=HTTPS "@{Hostname=`"$(hostname)`";CertificateThumbprint=`"$($cert.Thumbprint)`"}"
New-NetFirewallRule -Name "WinRM HTTPS" -DisplayName "WinRM HTTPS" -Protocol TCP -LocalPort 5986
```

Then configure the Avalok service with `port: 5986`, `use_https: true`, and `insecure: true` (for self-signed certs).

---

### PostgreSQL Connection Errors

If Avalok can't reach PostgreSQL, verify both services are on the same network. With `network_mode: host`, both services bind directly to the host network and communicate via `127.0.0.1`.

Check that PostgreSQL is healthy:

```bash
docker compose ps
docker compose logs postgres
```

---

## SSH Connections

### Permission Denied on Log Files with Sudo Enabled

If you enabled the **Use Sudo** toggle on the SSH target but still get `Permission denied` on the log file, make sure:

1. The remote user has passwordless sudo. Add this in `visudo` on the remote server:
   ```
   youruser ALL=(ALL) NOPASSWD: ALL
   ```
   Or restrict to just the commands Avalok uses:
   ```
   youruser ALL=(ALL) NOPASSWD: /usr/bin/tail, /usr/bin/cat
   ```

2. The `requiretty` setting is not blocking non-interactive sudo. Check with:
   ```bash
   sudo grep -i requiretty /etc/sudoers /etc/sudoers.d/*
   ```
   If present, override it for your user in `visudo`:
   ```
   Defaults:youruser !requiretty
   ```

### Permission Denied (Connection)

- Verify the SSH key or password is correct
- Check that the user has access to the log files on the remote host
- Ensure `sshd` is running: `systemctl status sshd`

### Connection Timeout

- Verify the host is reachable: `ping <host>`
- Check firewall rules for port 22
- Verify the SSH port if using a non-standard port

---
## General

### "Failed to Stream Any Instance"

This error means the provider connected but couldn't read logs from any instance. Common causes:

- **Wrong file path** — verify the file exists on the target machine
- **Permission denied** — the user account doesn't have read access to the log file
- **Connection issues** — the provider connected but the session dropped (check the full error in Avalok logs)

### Checking Avalok Server Logs

For Docker deployments:

```bash
docker compose logs -f avalok
```

For systemd deployments:

```bash
sudo journalctl -fu avalok
```