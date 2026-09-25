import ExcelJS from "exceljs";
import { getSettings } from "./settings";
import { tglIndo, toYMD } from "./util";

const thin = { style: "thin" as const, color: { argb: "FF6B7280" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function sheetName(name: string, used: Set<string>) {
  let base = name.replace(/[\\/*?:\[\]]/g, "").slice(0, 28) || "Kelas";
  let n = base,
    i = 2;
  while (used.has(n)) n = `${base} ${i++}`;
  used.add(n);
  return n;
}

/** weeks: hasil buildWeek() untuk satu atau banyak kelas */
export async function buildWorkbook(weeks: any[]) {
  const s = await getSettings();
  const color = (s.primary_color || "#0f766e").replace("#", "").toUpperCase();
  const wb = new ExcelJS.Workbook();
  wb.creator = s.app_name || "CALAKAN";
  wb.created = new Date();
  const used = new Set<string>();

  for (const w of weeks) {
    const ws = wb.addWorksheet(sheetName(w.class.rombel, used), {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    });
    ws.columns = [
      { width: 11 },
      { width: 20 },
      { width: 30 },
      { width: 34 },
      { width: 28 },
      { width: 16 },
    ];

    const title = (row: number, text: string, size: number, bold = true) => {
      ws.mergeCells(row, 1, row, 6);
      const c = ws.getCell(row, 1);
      c.value = text;
      c.font = { name: "Calibri", size, bold };
      c.alignment = { horizontal: "center", vertical: "middle" };
    };
    title(1, (s.school_name || "").toUpperCase(), 12);
    title(2, "RENCANA PEMBELAJARAN SEPEKAN", 14);
    title(3, (w.class.kelompok || `FASE ${w.class.fase}`).toUpperCase(), 12);

    ws.mergeCells(5, 1, 5, 3);
    ws.getCell(5, 1).value = `Kelas : ${w.class.label}`;
    ws.getCell(5, 1).font = { bold: true };
    ws.mergeCells(5, 5, 5, 6);
    ws.getCell(5, 5).value = `Tanggal : ${w.week.label}`;
    ws.getCell(5, 5).font = { bold: true };
    ws.getCell(5, 5).alignment = { horizontal: "right" };

    const head = ws.getRow(6);
    head.values = ["Hari", "Mata Pelajaran", "Materi Pembelajaran", "Rencana Kegiatan", "Tugas", "Keterangan"];
    head.height = 22;
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + color } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = border;
    });

    let r = 7;
    for (const d of w.days) {
      const rows = d.rows.length ? d.rows : [{ subject: "-", materi: "", kegiatan: "", tugas: "", keterangan: "" }];
      const start = r;
      for (const row of rows) {
        const xr = ws.getRow(r);
        xr.values = [d.name, row.subject, row.materi || "", row.kegiatan || "", row.tugas || "", row.keterangan || ""];
        xr.eachCell({ includeEmpty: true }, (c, col) => {
          if (col > 6) return;
          c.border = border;
          c.alignment = { vertical: "middle", wrapText: true, horizontal: col === 1 ? "center" : "left" };
        });
        r++;
      }
      if (r - 1 > start) ws.mergeCells(start, 1, r - 1, 1);
      ws.getCell(start, 1).font = { bold: true };
    }

    // Tanda tangan
    r += 1;
    const kota = s.kota ? `${s.kota}, ` : "";
    ws.getCell(r, 5).value = `${kota}${tglIndo(toYMD(new Date()))}`;
    r++;
    ws.getCell(r, 2).value = "Mengetahui,";
    r++;
    ws.getCell(r, 2).value = "Kepala Sekolah";
    ws.getCell(r, 5).value = "Wali Kelas";
    r += 4;
    ws.getCell(r, 2).value = s.kepala_sekolah || "(....................................)";
    ws.getCell(r, 5).value = w.class.wali_name || "(....................................)";
    ws.getCell(r, 2).font = { bold: true, underline: true };
    ws.getCell(r, 5).font = { bold: true, underline: true };
    if (w.week.status !== "published") {
      ws.getCell(r + 2, 1).value = "* Status: DRAF (belum diterbitkan)";
      ws.getCell(r + 2, 1).font = { italic: true, color: { argb: "FFB45309" } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Template impor siswa */
export async function studentTemplate(classes: any[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Siswa");
  ws.columns = [
    { header: "NIS", key: "nis", width: 16 },
    { header: "Nama Siswa", key: "name", width: 34 },
    { header: "L/P", key: "gender", width: 6 },
    { header: "Rombel", key: "rombel", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ nis: "2026001", name: "Contoh Nama Siswa", gender: "L", rombel: classes[0]?.rombel || "1A" });
  const info = wb.addWorksheet("Daftar Rombel");
  info.columns = [
    { header: "Rombel", width: 10 },
    { header: "Nama Kelas", width: 34 },
  ];
  info.getRow(1).font = { bold: true };
  for (const c of classes) info.addRow([c.rombel, `${c.tingkat} ${c.name}`]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function readStudentSheet(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: { nis: string; name: string; gender: string; rombel: string }[] = [];
  const text = (v: any) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return String(v.text ?? v.result ?? v.richText?.map((x: any) => x.text).join("") ?? "");
    return String(v);
  };
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const nis = text(row.getCell(1).value).trim();
    const name = text(row.getCell(2).value).trim();
    if (!nis || !name) return;
    out.push({ nis, name, gender: text(row.getCell(3).value).trim().toUpperCase(), rombel: text(row.getCell(4).value).trim().toUpperCase() });
  });
  return out;
}
