import * as XLSX from 'xlsx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ExportPackage, ExportTable } from './exportData';

const widths = {
  delivery: [7, 16, 30, 38, 42, 30, 42, 22, 28, 22, 26, 18, 28, 28, 34, 12, 42, 48, 48, 48],
  internal: [28, 30, 16, 38, 42, 25, 18, 42, 48, 28, 30, 28, 18, 24, 30, 42, 22, 22, 28, 16, 10, 20, 30, 12, 42, 18, 20, 28, 28, 28, 18, 14, 10, 24, 32, 48, 64, 48, 18, 48],
  evidence: [28, 30, 16, 20, 22, 24, 48, 70, 56, 18, 20, 12, 42, 18, 18, 24],
};

function worksheet(table: ExportTable, columnWidths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows], { cellDates: true });
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(table.headers.length - 1)}${Math.max(1, table.rows.length + 1)}` };
  sheet['!cols'] = columnWidths.map(wch => ({ wch }));
  sheet['!rows'] = [{ hpt: 32 }, ...table.rows.map(() => ({ hpt: 42 }))];
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  for (let row = range.s.r; row <= range.e.r; row++) for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    if (!cell) continue;
    if (cell.v instanceof Date) cell.z = 'yyyy-mm-dd hh:mm:ss';
    if (typeof cell.v === 'string' && /^https?:\/\//i.test(cell.v.trim()) && !cell.v.includes('\n')) cell.l = { Target: cell.v.trim() };
  }
  return sheet;
}

function addStyle(xml: string, collection: string, child: string) {
  const expression = new RegExp(`<${collection} count="(\\d+)">([\\s\\S]*?)</${collection}>`);
  return xml.replace(expression, (_match, count, body) => `<${collection} count="${Number(count) + 1}">${body}${child}</${collection}>`);
}

function styleWorkbook(files: Record<string, Uint8Array>) {
  const key = 'xl/styles.xml'; if (!files[key]) return;
  let xml = strFromU8(files[key]);
  const fontCount = Number(/<fonts count="(\d+)"/.exec(xml)?.[1] || 1);
  const fillCount = Number(/<fills count="(\d+)"/.exec(xml)?.[1] || 2);
  const borderCount = Number(/<borders count="(\d+)"/.exec(xml)?.[1] || 1);
  const xfCount = Number(/<cellXfs count="(\d+)"/.exec(xml)?.[1] || 1);
  xml = addStyle(xml, 'fonts', '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>');
  xml = addStyle(xml, 'fills', '<fill><patternFill patternType="solid"><fgColor rgb="FF166534"/><bgColor indexed="64"/></patternFill></fill>');
  xml = addStyle(xml, 'borders', '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>');
  xml = xml.replace(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/, (_match, count, body) =>
    `<cellXfs count="${Number(count) + 2}">${body}<xf numFmtId="0" fontId="${fontCount}" fillId="${fillCount}" borderId="${borderCount}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>`);
  files[key] = strToU8(xml);
  const headerStyle = xfCount; const bodyStyle = xfCount + 1;
  for (const path of Object.keys(files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))) {
    let sheetXml = strFromU8(files[path]);
    sheetXml = sheetXml.replace(/<sheetView([^>]*)\/>/, '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>');
    sheetXml = sheetXml.replace(/<sheetView([^>]*)>(?![\s\S]*?<pane)([\s\S]*?)<\/sheetView>/, '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>$2</sheetView>');
    sheetXml = sheetXml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (_match, rowNumber, attributes, cells) => {
      const style = Number(rowNumber) === 1 ? headerStyle : bodyStyle;
      const styled = cells.replace(/<c([^>]*)>/g, (_cell: string, cellAttributes: string) => `<c${/\ss="\d+"/.test(cellAttributes) ? cellAttributes.replace(/\ss="\d+"/, ` s="${style}"`) : `${cellAttributes} s="${style}"`}>`);
      return `<row r="${rowNumber}"${attributes}>${styled}</row>`;
    });
    files[path] = strToU8(sheetXml);
  }
}

export function createDeliveryWorkbook(data: ExportPackage) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet(data.delivery, widths.delivery), '提出用');
  XLSX.utils.book_append_sheet(workbook, worksheet(data.internal, widths.internal), '内部チェック用');
  XLSX.utils.book_append_sheet(workbook, worksheet(data.evidence, widths.evidence), '出典・根拠一覧');
  const raw = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true, cellDates: true });
  const files = unzipSync(new Uint8Array(raw as ArrayBuffer)); styleWorkbook(files);
  return zipSync(files, { level: 6 });
}
