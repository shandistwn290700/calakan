import { loadScript, tgl, ymd } from "./ui.js";

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [15, 118, 110];
}

async function logoData() {
  try {
    const res = await fetch("/logo");
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/image\/(png|jpeg)/.test(blob.type)) return null; // jsPDF: PNG/JPG saja
    return await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r({ data: fr.result, type: blob.type.includes("png") ? "PNG" : "JPEG" });
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Buat PDF dari satu/lebih hasil /calakan/week */
export async function exportPdf(weeks, settings, filename) {
  await loadScript("/vendor/jspdf.umd.min.js");
  await loadScript("/vendor/jspdf.autotable.min.js");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const autoTable = window.jspdf_autotable?.autoTable || window.autoTable || ((d, o) => d.autoTable(o));
  const color = hexToRgb(settings.primary_color);
  const logo = await logoData();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  weeks.forEach((w, idx) => {
    if (idx > 0) doc.addPage();
    let y = 14;
    if (logo) {
      try {
        doc.addImage(logo.data, logo.type, 12, 9, 16, 16);
      } catch {}
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text((settings.school_name || "").toUpperCase(), W / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text("RENCANA PEMBELAJARAN SEPEKAN", W / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text((w.class.kelompok || `FASE ${w.class.fase}`).toUpperCase(), W / 2, y, { align: "center" });
    y += 4;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.6);
    doc.line(12, y, W - 12, y);
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text(`Kelas : ${w.class.label}`, 12, y);
    doc.text(`Tanggal : ${w.week.label}`, W - 12, y, { align: "right" });
    y += 3;

    const body = [];
    for (const d of w.days) {
      const rows = d.rows.length ? d.rows : [{ subject: "-", materi: "", kegiatan: "", tugas: "", keterangan: "" }];
      rows.forEach((r, i) => {
        const line = [r.subject, r.materi || "", r.kegiatan || "", r.tugas || "", r.keterangan || ""];
        if (i === 0) line.unshift({ content: d.name, rowSpan: rows.length, styles: { valign: "middle", halign: "center", fontStyle: "bold", fillColor: [240, 248, 246] } });
        body.push(line);
      });
    }
    autoTable(doc, {
      startY: y + 2,
      head: [["Hari", "Mata Pelajaran", "Materi Pembelajaran", "Rencana Kegiatan", "Tugas", "Keterangan"]],
      body,
      theme: "grid",
      margin: { left: 12, right: 12, bottom: 16 },
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: 1.8, lineColor: [200, 205, 212], lineWidth: 0.2, textColor: 30, overflow: "linebreak" },
      headStyles: { fillColor: color, textColor: 255, fontStyle: "bold", halign: "center", valign: "middle" },
      columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 28, fontStyle: "bold" }, 2: { cellWidth: 40 }, 3: { cellWidth: 44 }, 4: { cellWidth: 35 }, 5: { cellWidth: "auto" } },
    });

    let fy = (doc.lastAutoTable?.finalY || y + 20) + 10;
    if (fy + 38 > H - 10) {
      doc.addPage();
      fy = 20;
    }
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    const kota = settings.kota ? settings.kota + ", " : "";
    doc.text(`${kota}${tgl(ymd(new Date()))}`, W - 55, fy, { align: "center" });
    doc.text("Mengetahui,", 55, fy + 5, { align: "center" });
    doc.text("Kepala Sekolah", 55, fy + 10, { align: "center" });
    doc.text("Wali Kelas", W - 55, fy + 10, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text(settings.kepala_sekolah || "(..............................)", 55, fy + 32, { align: "center" });
    doc.text(w.class.wali_name || "(..............................)", W - 55, fy + 32, { align: "center" });
    if (w.week.status !== "published") {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(180, 83, 9);
      doc.setFontSize(8);
      doc.text("DRAF – belum diterbitkan", 12, fy + 40);
      doc.setTextColor(30);
    }
  });

  // nomor halaman
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(`${settings.app_name} · ${settings.school_name}`, 12, H - 7);
    doc.text(`Hal. ${i} / ${n}`, W - 12, H - 7, { align: "right" });
  }
  doc.save(filename);
}
