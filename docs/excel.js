const escape = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[c]);
const encode = text => new TextEncoder().encode(text);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit=0; bit<8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size, fields) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  for (const [offset,width,value] of fields) {
    if (width === 2) view.setUint16(offset,value,true);
    else view.setUint32(offset,value,true);
  }
  return buffer;
}
function zip(files) {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  for (const [path,text] of Object.entries(files)) {
    const name = encode(path), bytes = encode(text), crc = crc32(bytes), length = bytes.length;
    local.push(header(30,[[0,4,0x04034b50],[4,2,20],[12,2,33],[14,4,crc],[18,4,length],[22,4,length],[26,2,name.length]]),name,bytes);
    central.push(header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[14,2,33],[16,4,crc],[20,4,length],[24,4,length],[28,2,name.length],[42,4,offset]]),name);
    offset += 30 + name.length + length;
    centralSize += 46 + name.length;
  }
  const count = Object.keys(files).length;
  return new Blob([...local,...central,header(22,[[0,4,0x06054b50],[8,2,count],[10,2,count],[12,4,centralSize],[16,4,offset]])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function columnName(number) {
  let label = '';
  for (; number > 0; number = Math.floor((number-1)/26)) {
    label = String.fromCharCode(65 + (number-1)%26) + label;
  }
  return label;
}
function styles(ns) {
  const colors = {mint:'FF67E9A6', white:'FFF3F5F4', black:'FF121514', gray:'FF202423', line:'FF414742'};
  const fonts = [
    ['FF111815',11,false],['FF101A15',20,true],['FF18241D',11,true],
    [colors.white,11,true],[colors.white,11,false],[colors.mint,11,true]
  ].map(([color,size,bold]) => `<font><name val="Calibri"/><sz val="${size}"/><color rgb="${color}"/>${bold ? '<b/>' : ''}</font>`).join('');
  const fills = [colors.mint,colors.black,colors.gray].map(color => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('');
  const edge = name => `<${name} style="thin"><color rgb="${colors.line}"/></${name}>`;
  const formats = [
    [0,0,0,'left'],[1,2,0,'left'],[2,2,0,'left'],[5,4,1,'center'],[3,4,1,'center'],
    [3,3,1,'left'],[4,3,1,'center'],[3,4,1,'left'],[4,4,1,'center'],[5,4,0,'left']
  ].map(([font,fill,border,alignment]) => `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center" wrapText="1" indent="${alignment === 'left' ? 1 : 0}"/></xf>`).join('');
  return `<styleSheet xmlns="${ns}"><fonts count="6">${fonts}</fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills}</fills><borders count="2"><border/><border>${['left','right','top','bottom'].map(edge).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10">${formats}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
export function workbook({period,dates,rows}) {
  const end = columnName(dates.length+1);
  const row = (number,values,height,style) => `<row r="${number}" ht="${height}" customHeight="1">${values.map((value,index) =>
    `<c r="${columnName(index+1)}${number}" s="${style(index)}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join('')}</row>`;
  const banner = (number,text,height,style) => row(number,[text,...dates.map(()=>'')],height,()=>style);
  const sheet = [
    banner(1,'ESCALA DO LOUVOR',34,1),
    banner(2,'Período: '+period,23,2),
    row(3,['Função',...dates],23,()=>3),
    row(4,['',...dates.map(()=>'DOMINGO')],21,()=>4),
    ...rows.map((values,index) => row(index+5,values,36,col => (index%2 ? 7 : 5)+Number(col > 0))),
    banner(rows.length+5,'TB = Talkback  •  — = função fora da formação do dia',25,9)
  ].join('');
  const merges = [1,2,rows.length+5].map(n => `<mergeCell ref="A${n}:${end}${n}"/>`).join('');
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="${office}"><sheets><sheet name="Escala" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles(ns),
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B5" sqref="B5"/></sheetView></sheetViews><cols><col min="1" max="1" width="27" customWidth="1"/><col min="2" max="${dates.length+1}" width="23" customWidth="1"/></cols><sheetData>${sheet}</sheetData><mergeCells count="3">${merges}</mergeCells></worksheet>`
  });
}
