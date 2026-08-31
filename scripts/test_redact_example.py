# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "pypdf>=6.16.2",
# ]
# ///
import pypdf
import os

def redact_file(in_path, out_path):
    reader = pypdf.PdfReader(in_path)
    writer = pypdf.PdfWriter()

    # Page 1
    p1 = reader.pages[0]
    raw1 = p1.get_contents().get_data().decode('latin1')
    san1 = raw1.replace('(API_KEY: sk-secret-9988224411aaccbb-production)', '()')
    san1 = san1.replace('(User Password: SuperSecretPassword123!)', '()')
    san1 = san1.replace('(Customer Name: John Doe \\(SSN: 123-45-6789\\))', '()')

    # Blackout + Mosaic + Whiteout overlays
    overlays1 = "\nq\n0 0 0 rg\n45 642 440 24 re\nf\nQ\n"
    # Mosaic grid
    overlays1 += "q\n45 612 380 24 re\nW\nn\n"
    for iy in range(4):
        for ix in range(32):
            bx = 45.0 + ix * 12.0
            by = 612.0 + iy * 6.0
            color = "0.62 0.75 0.90" if (ix+iy)%2==0 else "0.43 0.55 0.76"
            overlays1 += f"{color} rg {bx:.2f} {by:.2f} 12 6 re f\n"
    overlays1 += "Q\n"
    # Whiteout
    overlays1 += "q\n1 1 1 rg\n45 582 360 24 re\nf\nQ\n"

    s1 = pypdf.generic.DecodedStreamObject()
    s1.set_data((san1 + overlays1).encode('latin1'))
    added_p1 = writer.add_page(p1)
    added_p1[pypdf.generic.NameObject('/Contents')] = writer._add_object(s1)

    # Page 2
    p2 = reader.pages[1]
    raw2 = p2.get_contents().get_data().decode('latin1')
    san2 = raw2.replace('(Gross Revenue: $14,250,000 USD)', '()')
    san2 = san2.replace('(Net Profit Margin: 34.5% \\(Internal Use Only\\))', '()')
    overlays2 = "\nq\n0 0 0 rg\n45 608 420 56 re\nf\nQ\n"

    s2 = pypdf.generic.DecodedStreamObject()
    s2.set_data((san2 + overlays2).encode('latin1'))
    added_p2 = writer.add_page(p2)
    added_p2[pypdf.generic.NameObject('/Contents')] = writer._add_object(s2)

    # Page 3
    p3 = reader.pages[2]
    writer.add_page(p3)

    with open(out_path, 'wb') as f:
        writer.write(f)

    # Verify immediately
    vr = pypdf.PdfReader(out_path)
    t1 = vr.pages[0].extract_text()
    t2 = vr.pages[1].extract_text()
    print("Page 1 Text:\n", t1)
    print("Page 2 Text:\n", t2)
    assert 'sk-secret' not in t1
    assert 'SuperSecretPassword' not in t1
    assert 'CONFIDENTIAL DOCUMENT' in t1
    assert '$14,250,000' not in t2
    print(f"SUCCESS creating {out_path}!")

redact_file('examples/sample_document.pdf', 'examples/sample_document_redacted.pdf')
