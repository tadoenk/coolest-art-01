# coolest-art-01 Entry: White Tiger in Aurora Night

An entry for the [make.fun](https://make.fun) coolest-art-01 competition.

## Artwork Description
The artwork depicts a majestic white tiger standing on a cliff edge at night, its fur dissolving seamlessly into vibrant aurora light and sparkling stars. 

- **File Name:** `entry.png`
- **Format:** JPEG image data (JFIF), 1024x1024 pixels, 292,881 bytes.
- **Note on Extension:** Although named `entry.png`, the file contains valid JPEG bytes. The competition rules explicitly allow either PNG or JPEG format, distinguished by their magic bytes rather than the file extension.

## Program (`main.ts`)
`main.ts` is written in Node 22 TypeScript using standard library modules only (`node:fs`, `node:path`, `node:url`). It performs rigorous validation before copying the image:
1. **Source Resolution & Reading:** Resolves `entry.png` relative to `main.ts` and reads it into a Buffer.
2. **Size Validation:** Ensures byte size is greater than 0 and at most 1,048,576 bytes (1 MiB).
3. **Magic Byte Validation:** Detects either PNG signature (`89 50 4E 47 0D 0A 1A 0A`) or JPEG SOI (`FF D8 FF`).
4. **Dimension & Structure Parsing:** 
   - For PNG: Parses width and height as big-endian uint32 from the `IHDR` chunk.
   - For JPEG: Walks marker segments to find the Start Of Frame (`C0` or `C2`), reads height and width, and verifies the presence of the end-of-image marker (`FF D9`). Ensures dimensions are between 1 and 1024 pixels and that the image is complete ("whole image").
5. **Output Writing & Verification:** Copies the exact source bytes into the directory specified by `MAKEFUN_OUTPUT_DIR` (defaulting to `/output`), creating directories recursively if needed. Reads the written file back and verifies it is byte-for-byte identical to the source buffer.
6. **Summary Output:** Prints a clean summary line upon success.

## How to Run
```bash
MAKEFUN_OUTPUT_DIR=out node main.ts
```
If `MAKEFUN_OUTPUT_DIR` is omitted, it defaults to `/output`.

## License
Distributed under the MIT License. See [LICENSE](LICENSE) for details.
