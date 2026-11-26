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
function wrap(value,limit) {
  const lines = [];
  let line = '';
  for (const word of value.trim().split(/\s+/)) {
    if (line && line.length + word.length + 1 > limit) {
      lines.push(line);
      line = '';
    }
    let remainder = word;
    while (remainder.length > limit) {
      lines.push(remainder.slice(0,limit));
      remainder = remainder.slice(limit);
    }
    line = line ? line+' '+remainder : remainder;
  }
  if (line) lines.push(line);
  return lines;
}

const noteIcon = '7 4 m 7 11 l 12 12 l 12 9 l 7 8 l S 7 4 m 7 1 2 1 2 3 c 2 5 7 6 7 4 c S';
const roleIcons = {
  vocal: '5 11 m 5 14 10 14 10 11 c 10 7 l 10 4 5 4 5 7 c h S 3 8 m 3 2 12 2 12 8 c S 7.5 3 m 7.5 1 l 5 1 m 10 1 l S',
  teclado: '1 3 13 9 re S 4 3 m 4 7 l 7 3 m 7 7 l 10 3 m 10 7 l S 3 8 2 4 re f 6 8 2 4 re f 9 8 2 4 re f',
  bateria: '3 6 m 3 8 12 8 12 6 c 12 4 3 4 3 6 c h S 3 6 m 3 2 l 3 0 12 0 12 2 c 12 6 l S 2 13 m 7 9 l 13 13 m 8 9 l S',
  percussao: '3 9 m 3 12 12 12 12 9 c 12 7 3 7 3 9 c h S 3 9 m 5 2 l 10 2 l 12 9 l S 5 7 m 7 2 l 10 7 l S',
  violao: '8 7 m 11 6 8 1 5 1 c 1 1 0 5 3 7 c 5 7 4 10 7 10 c 8 10 9 9 9 8 c S 7 7 m 13 13 l 14 12 l 8 6 l S 5 4 2 2 re S',
  guitarra: '7 7 m 10 6 8 2 5 1 c 2 0 0 3 2 6 c 3 7 5 6 5 8 c 5 10 4 11 7 10 c 8 10 9 9 8 8 c S 7 7 m 13 13 l 14 12 l 8 6 l S 4 4 m 6 3 l S',
  baixo: '6 6 m 10 7 9 2 5 1 c 2 0 0 3 2 5 c 3 7 5 6 5 8 c 5 9 7 9 8 8 c S 6 6 m 12 13 l 14 12 l 7 5 l S 4 4 m 6 3 l S'
};
function iconFor(role) {
  const key = role.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if (key.startsWith('vocal')) return roleIcons.vocal;
  if (key === 'dirigente' || key === 'formacao') return '';
  const instrument = key.replace(/ \d+$/,'');
  return Object.hasOwn(roleIcons,instrument) ? roleIcons[instrument] : noteIcon;
}

function roundedPath(left,bottom,right,top,radius) {
  const r = radius;
  const k = r*.5523;
  return `${left+r} ${bottom} m ${right-r} ${bottom} l
${right-r+k} ${bottom} ${right} ${bottom+r-k} ${right} ${bottom+r} c
${right} ${top-r} l ${right} ${top-r+k} ${right-r+k} ${top} ${right-r} ${top} c
${left+r} ${top} l ${left+r-k} ${top} ${left} ${top-r+k} ${left} ${top-r} c
${left} ${bottom+r} l ${left} ${bottom+r-k} ${left+r-k} ${bottom} ${left+r} ${bottom} c h`;
}
const colorsByRole = {
  director: {accent:'.42 .23 .62', tint:'.96 .93 .99'},
  vocal: {accent:'.62 .23 .40', tint:'.99 .94 .97'},
  instrument: {accent:'.08 .39 .34', tint:'.91 .97 .95'},
  default: {accent:'.29 .35 .45', tint:'.96 .97 .99'}
};
function rowColors(role) {
  if (role === 'Dirigente') return colorsByRole.director;
  if (role.startsWith('Vocal')) return colorsByRole.vocal;
  if (role === 'Formação') return colorsByRole.default;
  return colorsByRole.instrument;
}

export function pdfDocument(sections) {
  const objects = ['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const ink = '.10 .15 .24', navy = '.09 .16 .31', blue = '.16 .29 .62';
  const muted = '.29 .35 .45', pale = '.91 .94 .99', stripe = '.96 .97 .99';
  const green = '.42 .88 .66', white = '1 1 1', amber = '.58 .22 .06';
  const pages = [];
  let commands = '', y = 0, table;
  function text(value,x,baseline,size,color=ink,bold=false) {
    commands += `${color} rg BT /${bold ? 'B' : 'R'} ${size} Tf ${x} ${baseline} Td ${literal(value)} Tj ET\n`;
  }
  function box(x,bottom,w,h,color) {
    commands += `${color} rg ${x} ${bottom} ${w} ${h} re f\n`;
  }
  function finish() {
    if (!commands) return;
    box(45,49,505,1,pale);
    text('Escala do Louvor',45,31,9,muted);
    text('Página '+(pages.length+1),495,31,9,muted);
    const page = objects.length + 1;
    pages.push(page);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /R 3 0 R /B 4 0 R >> >> /Contents ${page+1} 0 R >>`);
    objects.push(`<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
    commands = '';
  }
  function start() {
    box(0,742,595,100,navy);
    box(45,768,5,43,green);
    text('Escala do Louvor',63,792,26,white,true);
    text('Escala publicada',64,770,11,white);
    y = 720;
  }
  function closeTable() {
    const outline = roundedPath(45,y,550,table.top,10);
    const body = commands.slice(table.offset);
    commands = commands.slice(0,table.offset) + `q ${outline} W n\n${body}Q\nq .71 .77 .88 RG .85 w ${outline} S Q\n`;
    table = undefined;
  }
  function header(title) {
    table = {top:y,offset:commands.length};
    box(45,y-31,505,31,pale);
    box(45,y-31,5,31,blue);
    text(title,57,y-20,13,blue,true);
    y -= 31;
    box(45,y-22,505,22,navy);
    text('FUNÇÃO',77,y-15,9,white,true);
    text('INTEGRANTE',289,y-15,9,white,true);
    y -= 22;
  }
  function drawRow(role,name,index,fullRole=role) {
    const roles = role.split('\n'), names = name.split('\n');
    const height = 10 + Math.max(1,roles.length,names.length)*13;
    if (y-height < 63) return false;
    box(45,y-height,505,height,index%2 ? stripe : white);
    const {accent,tint} = rowColors(fullRole);
    box(45,y-height,226,height,tint);
    box(270,y-height,.5,height,pale);
    const icon = iconFor(fullRole);
    if (icon) commands += `q ${accent} RG ${accent} rg 1 w 1 J 1 j 1 0 0 1 57 ${y-18} cm ${icon} Q\n`;
    roles.forEach((line,i) => text(line,77,y-14-i*13,10,accent,true));
    names.forEach((line,i) => text(line,289,y-14-i*13,10,name === 'Vaga em aberto' ? amber : ink));
    y -= height;
    box(45,y,505,.45,pale);
    return true;
  }
  start();
  for (const section of sections) {
    if (y < 151) { finish(); start(); }
    header(section.title);
    if (!section.rows.length) drawRow('Formação','Nenhuma função cadastrada.',0);
    section.rows.forEach(({role,name},index) => {
      const roles = wrap(role,24), names = wrap(name,28);
      // Limita cada bloco para que entradas longas também possam continuar em outra página.
      for (let offset=0;offset<Math.max(roles.length,names.length,1);offset+=32) {
        const left = roles.slice(offset,offset+32).join('\n');
        const right = names.slice(offset,offset+32).join('\n');
        if (!drawRow(left,right,index,role)) {
          closeTable(); finish(); start(); header(section.title+' (continuação)');
          drawRow(left,right,index,role);
        }
      }
    });
    closeTable();
    y -= 19;
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
