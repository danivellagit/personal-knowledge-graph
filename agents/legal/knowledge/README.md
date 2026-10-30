# agents/legal/knowledge

Reference texts for the legal agent, for the jurisdiction configured in its memory. Cite the file
and the article; never quote law from memory. Empty in the template: add the texts the owner's
matters need.

For each text, one bullet here:

- `<file>.txt`: **what it is** (title, edition, in force as of which amendment), the official
  source URL, the download date, the sha256 of the original file, how it was converted to text
  (e.g. `pdftotext`) and any quirk of the conversion (footnote markers glued to words, page headers
  inline).

Rules:

- Official texts only (a parliament, an official gazette, a government portal), never a
  third-party summary.
- Plain text in the repo; the original PDF stays outside it (the pre-commit guard keeps PDFs out),
  at a path noted here.
- When a newer edition is published, replace the file and update its bullet (date, checksum).
