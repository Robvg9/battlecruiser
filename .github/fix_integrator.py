from pathlib import Path
import re

p = Path('.github/integrate_legacy.py')
s = p.read_text()

# Make the filtered R10 patch a valid patch by retaining its file headers.
old = "lines=patch.splitlines(True); out=[]; h=[]; keep=False\nfor line in lines:\n    if line.startswith('@@ '):\n        keep=('-3261' in line or '-3329' in line)\n    if keep: out.append(line)\nPath('/tmp/r10code.patch').write_text(''.join(out))"
new = "lines=patch.splitlines(True); out=[]; in_hunk=False; keep=False\nfor line in lines:\n    if line.startswith('diff --git ') or line.startswith('index ') or line.startswith('--- ') or line.startswith('+++ '):\n        out.append(line); in_hunk=False; continue\n    if line.startswith('@@ '):\n        in_hunk=True; keep=('-3261' in line or '-3329' in line)\n        if keep: out.append(line)\n        continue\n    if in_hunk and keep: out.append(line)\nPath('/tmp/r10code.patch').write_text(''.join(out))"
if old in s:
    s = s.replace(old, new, 1)

s = s.replace("sh('git','apply','--3way','--index','/tmp/r10code.patch')", "sh('git','apply','/tmp/r10code.patch')", 1)
s = s.replace("Path('/tmp/r10html.patch').write_text(patch); sh('git','apply','--3way','--index','/tmp/r10html.patch')", "Path('/tmp/r10html.patch').write_text(patch)", 1)

# R10 already declares its own search state/counter in the selected render hunk.
replacement = "extra='''safeInit(\"movimientos-buscadores-trf-vales\",()=>{[{i:\"trf-buscar\",v:\"trf\",r:renderTransferenciasLista},{i:\"vales-buscar\",v:\"vale\",r:renderValesLista}].forEach(c=>{const input=document.getElementById(c.i);if(!input)return;input.addEventListener(\"input\",()=>{if(c.v===\"trf\")_trfBusqueda=input.value||\"\";else _valesBusqueda=input.value||\"\";c.r();});});});\\n\\n'''"
s2, n = re.subn(r"extra='''let _trfBusqueda.*?'''", replacement, s, count=1, flags=re.S)
if n == 1:
    s = s2

p.write_text(s)
print('integrator repaired')
