// Os nomes em português cabem na codificação WinAnsi das fontes padrão do PDF.
const winAnsi = new Map([['–',150],['—',151],['•',149],['’',146],['‘',145],['“',147],['”',148],['€',128]]);
function literal(text) {
  return '(' + [...text.normalize('NFC')].map(character => {
    const code = winAnsi.get(character) || character.codePointAt(0);
    if (code >= 32 && code < 127 && !'()\\'.includes(character)) return character;
    if (code >= 32 && code <= 255) return '\\' + code.toString(8).padStart(3,'0');
    return '?';
  }).join('') + ')';
}
export function pdfDocument(sections) {
  const objects = ['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pages = [];
  let commands = '', y = 0;
  function line(text, size, bold=false) {
    commands += `BT /${bold ? 'B' : 'R'} ${size} Tf 47 ${y} Td ${literal(text)} Tj ET\n`;
    y -= size + 7;
  }
  function finish() {
    if (!commands) return;
    const page = objects.length + 1;
    pages.push(page);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /R 3 0 R /B 4 0 R >> >> /Contents ${page+1} 0 R >>`);
    objects.push(`<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
    commands = '';
  }
  function start() {
    y = 789;
    line('Escala do Louvor',23,true);
    y -= 12;
  }
  start();
  for (const section of sections) {
    if (y < 116 || (y < 789-42 && section.lines.length*18+43 > y-55)) {
      finish(); start();
    }
    line(section.title,15,true);
    for (const entry of section.lines) {
      const chunks = entry.match(/.{1,75}(?:\s|$)|.{1,75}/gu) || [''];
      for (const chunk of chunks) {
        if (y < 55) {
          finish(); start(); line(section.title+' (continuação)',15,true);
        }
        line(chunk.trim(),11);
      }
    }
    y -= 16;
  }
  finish();
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(id => id+' 0 R').join(' ')}] >>`;
  let content = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object,index) => {
    offsets.push(content.length);
    content += `${index+1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = content.length;
  content += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for (const offset of offsets) content += String(offset).padStart(10,'0')+' 00000 n \n';
  content += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([content],{type:'application/pdf'});
}
