# Explicit SSH stdin transport acceptance

Fresh bounded Sonnet/high review3c7a3896-4a28-47c9-beb5-d05bfd0a23cd accepted
the20-line CLI delta with no material finding. Actual Read,Write tools, strict
empty MCP; source/test files only, no secrets or network. Existing private
first-install semantics are unchanged. All10 fixtures and py_compile pass.

`--key-stdin` is an explicit non-TTY64hex input, capped at67bytes with only an
optional LF/CRLF terminator. Dry-run never reads stdin; failed scope guards
precede input. No key value enters argv/output/logs. Documented SSH is the
backend transport, not automation of the blocked Terminal application.

Source SHA256df1bafd9bb118949bda34e06c066c2e6aaebab62d3affb4e304a114b356daa02.
Test SHA256ec305f9dfe357e147853a44f18a109d3f90f981e57a48ad79a3a04293e79f35d.
Full response: /Users/xbohdpukc/dev/peri/output/shared-test-webhook/STDIN-RESPONSE-R1.md.
Usage:4 calls, input8, creation44610, reads109423, output8461, maxcontext49451,
reported cost0.2849506, no warnings. No real key installation is claimed.
