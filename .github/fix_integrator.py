from pathlib import Path
import re

p = Path('.github/integrate_legacy.py')
s = p.read_text()
replacement = '''extra='''safeInit("movimientos-buscadores-trf-vales",()=>{[{i:"trf-buscar",v:"trf",r:renderTransferenciasLista},{i:"vales-buscar",v:"vale",r:renderValesLista}].forEach(c=>{const input=document.getElementById(c.i);if(!input)return;input.addEventListener("input",()=>{if(c.v==="trf")_trfBusqueda=input.value||"";else _valesBusqueda=input.value||"";c.r();});});});\n\n''' '''
s2, n = re.subn(r"extra='''let _trfBusqueda.*?'''", replacement, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit('R10 duplicate-state block not found')
p.write_text(s2)
print('integrator repaired')
