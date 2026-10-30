import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "./crc32.js";
import { auditGitHubArtifact } from "./github-artifact.js";
import { verifyPagesArtifactContents, type PagesArtifactFile } from "./pages-artifact.js";

interface Entry { name: string; type: string; bytes: Buffer }
const files: PagesArtifactFile[] = [
  { path: "lyrics/latest.json", bytes: Buffer.from("{}\n") },
  { path: `lyrics/objects/${"a".repeat(64)}.json.gz`, bytes: Buffer.from([0x1f, 0x8b, 0, 0xff]) }
];
const entries = (): Entry[] => [
  ...["./", "./lyrics/", "./lyrics/objects/"].map(name => ({ name, type: "5", bytes: Buffer.alloc(0) })),
  ...files.map(file => ({ name: `./${file.path}`, type: "0", bytes: Buffer.from(file.bytes) }))
];
function checksum(header: Buffer) {
  header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
}
function tar(input = entries()): Buffer {
  return Buffer.concat([...input.flatMap(entry => {
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "ascii");
    for (const [offset, width, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0],
      [124, 12, entry.bytes.length], [136, 12, 0]]) {
      header.write(value!.toString(8).padStart(width! - 1, "0") + "\0", offset!, width!, "ascii");
    }
    header.write(entry.type, 156, 1, "ascii");
    header.write("ustar  \0", 257, 8, "ascii");
    checksum(header);
    return [header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512)];
  }), Buffer.alloc(1024)]);
}
function zip(body = tar(), compressedTail = Buffer.alloc(0)): Buffer {
  const compressed = Buffer.concat([deflateRawSync(body), compressedTail]), name = Buffer.from("artifact.tar");
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  const descriptor = Buffer.alloc(16), crc = crc32(body);
  descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(body.length, 12);
  const central = Buffer.alloc(46 + name.length), offset = local.length + compressed.length + descriptor.length;
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(813, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0x81a40020, 38); name.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, compressed, descriptor, central, end]);
}
const bounds = { maxArchiveBytes: 65536, maxTarBytes: 65536, maxFiles: 10 };
const verify = (archive: Buffer, expected = files) => verifyPagesArtifactContents(archive, expected, bounds);

test("exact GNU tar members inside the current Pages ZIP profile match every expected byte without mutation or extraction", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const body = tar(), archive = zip(body), before = Buffer.from(archive), original = files.map(file => Buffer.from(file.bytes));
  const report = verify(archive);
  assert.deepEqual(report, { stage: "pages-artifact-contents",
    archiveSha256: createHash("sha256").update(archive).digest("hex"), archiveBytes: archive.length,
    tarBytes: body.length, fileCount: 2, directoryCount: 3, totalFileBytes: 7 });
  const containing = Buffer.concat([Buffer.from([1, 2, 3]), archive, Buffer.from([4, 5])]);
  assert.deepEqual(verify(containing.subarray(3, -2)), report);
  assert.deepEqual(archive, before);
  assert.deepEqual(files.map(file => Buffer.from(file.bytes)), original);
  assert.deepEqual(verify(zip(tar(entries().reverse()))).fileCount, 2);
});

test("exact archive, decoded tar and file-count bounds pass; each minus one and invalid bound fails", () => {
  const body = tar(), archive = zip(body);
  const exact = { maxArchiveBytes: archive.length, maxTarBytes: body.length, maxFiles: files.length };
  assert.equal(verifyPagesArtifactContents(archive, files, exact).fileCount, 2);
  for (const key of ["maxArchiveBytes", "maxTarBytes", "maxFiles"]) {
    assert.throws(() => verifyPagesArtifactContents(archive, files, { ...exact, [key]: exact[key as keyof typeof exact] - 1 }));
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
      assert.throws(() => verifyPagesArtifactContents(archive, files, { ...exact, [key]: value }), /inputs or limits/);
    }
  }
  const forged = Buffer.from(archive), central = forged.readUInt32LE(forged.length - 6);
  forged.writeUInt32LE(1024, central + 24); forged.writeUInt32LE(1024, central - 4);
  assert.throws(() => verifyPagesArtifactContents(forged, files, { ...bounds, maxTarBytes: 1024 }));
});

test("invalid or duplicate expected files, path collisions and unsafe names fail before decompression", () => {
  const archive = zip();
  for (const path of ["", "../latest.json", "/latest.json", "lyrics//latest.json", "lyrics/./latest.json",
    "lyrics/../latest.json", "lyrics/latest.json/", "lyrics\\latest.json", "C:/latest.json", "a".repeat(99), "ಕನ್ನಡ"]) {
    assert.throws(() => verify(archive, [{ path, bytes: Buffer.alloc(0) }]), /expected Pages file/);
  }
  assert.throws(() => verify(archive, []), /inputs or limits/);
  assert.throws(() => verify(archive, [files[0]!, files[0]!]), /duplicate/);
  assert.throws(() => verify(archive, [{ path: "lyrics", bytes: Buffer.alloc(0) }, files[0]!]), /collide/);
  assert.throws(() => Reflect.apply(verifyPagesArtifactContents, undefined, [archive, [{ path: "x", bytes: "bad" }], bounds]));
  assert.throws(() => Reflect.apply(verifyPagesArtifactContents, undefined, ["bad", files, bounds]));
});

test("ZIP truncation, prefixes, suffixes and altered structural, encryption, descriptor and ZIP64 fields are rejected", () => {
  const archive = zip(), end = archive.length - 22, central = archive.readUInt32LE(end + 16), descriptor = central - 16;
  for (let size = 0; size < archive.length; size++) assert.throws(() => verify(archive.subarray(0, size)));
  for (const offset of [0, 4, 6, 8, 14, 18, 22, 26, 28, 30, descriptor, descriptor + 4, descriptor + 8, descriptor + 12,
    central, central + 6, central + 8, central + 10, central + 16, central + 20, central + 24,
    central + 28, central + 30, central + 32, central + 34, central + 42, central + 46,
    end, end + 4, end + 8, end + 10, end + 12, end + 16, end + 20]) {
    const changed = Buffer.from(archive); changed[offset] = changed[offset]! ^ 1;
    assert.throws(() => verify(changed), `ZIP field ${offset}`);
  }
  for (const mode of [0xa1ff0000, 0x41ed0000, 0x21a40000]) {
    const changed = Buffer.from(archive); changed.writeUInt32LE(mode, central + 38);
    assert.throws(() => verify(changed), /regular file/);
  }
  assert.throws(() => verify(Buffer.concat([Buffer.from([0]), archive])));
  assert.throws(() => verify(Buffer.concat([archive, Buffer.from([0])])));
  assert.throws(() => verify(zip(tar(), Buffer.from([0]))), /exact compressed member/);
  const changed = Buffer.from(archive); changed.fill(0xff, 42, central - 16);
  assert.throws(() => verify(changed));
});

test("missing, extra, duplicate, nonregular and changed tar members cannot yield a partial content match", () => {
  for (const input of [
    entries().slice(1), entries().slice(0, -1),
    [...entries(), entries()[3]!], [...entries(), entries()[0]!],
    [...entries(), { name: "./unexpected/", type: "5", bytes: Buffer.alloc(0) }],
    [...entries(), { name: "./extra", type: "0", bytes: Buffer.from("not allowed") }]
  ]) assert.throws(() => verify(zip(tar(input))));
  for (const type of ["1", "2", "3", "4", "6", "x", "g", "L", "S", "\0"]) {
    const input = entries(); input[3] = { ...input[3]!, type };
    assert.throws(() => verify(zip(tar(input))));
  }
  const changed = entries(); changed[3] = { ...changed[3]!, bytes: Buffer.from("[]\n") };
  assert.throws(() => verify(zip(tar(changed))), /expected file set and bytes/);
  assert.throws(() => verify(zip(), [...files, { path: "extra", bytes: Buffer.alloc(0) }]), /incomplete/);
});

test("tar checksums, numeric/name fields, GNU extensions, data padding and end records are independently checked", () => {
  const original = tar();
  for (const offset of [100, 148, 257, 345]) {
    const changed = Buffer.from(original); changed[offset] = changed[offset]! ^ 1;
    assert.throws(() => verify(zip(changed)));
  }
  for (const change of [
    (header: Buffer) => { header.fill(0, 124, 136); header.write("not-octal", 124); },
    (header: Buffer) => { header[124] = 128; },
    (header: Buffer) => { header[10] = 65; },
    (header: Buffer) => { header.write("../", 0); },
    (header: Buffer) => { header[157] = 65; },
    (header: Buffer) => { header[345] = 65; },
    (header: Buffer) => { header.fill(55, 124, 135); }
  ]) {
    const changed = Buffer.from(original), header = changed.subarray(0, 512);
    change(header); checksum(header);
    assert.throws(() => verify(zip(changed)));
  }
  const padding = Buffer.from(original); padding[3 * 512 + 512 + 3] = 1;
  assert.throws(() => verify(zip(padding)), /padding/);
  const trailing = Buffer.from(original); trailing[trailing.length - 1] = 1;
  assert.throws(() => verify(zip(trailing)), /trailing/);
  assert.throws(() => verify(zip(original.subarray(0, -512))), /incomplete|trailing/);
  assert.throws(() => verify(zip(Buffer.concat([original, Buffer.from([0])]))));
});

test("declared file sizes, complete expected contents and empty regular files are distinguished from metadata approval", () => {
  const input = entries(), empty = { path: "empty", bytes: Buffer.alloc(0) };
  input.push({ name: "./empty", type: "0", bytes: empty.bytes });
  assert.equal(verify(zip(tar(input)), [...files, empty]).fileCount, 3);
  const wrong = Buffer.from(tar()), header = wrong.subarray(3 * 512, 4 * 512);
  header.write("00000000002\0", 124, 12, "ascii"); checksum(header);
  assert.throws(() => verify(zip(wrong)));
  const different = files.map(file => ({ ...file, bytes: Buffer.from(file.bytes) }));
  different[0]!.bytes[0] = 91;
  assert.throws(() => verify(zip(), different));
  const metadata = Buffer.from(zip()); metadata.writeUInt16LE(1234, 10);
  assert.equal(verify(metadata).fileCount, 2);
  assert.notEqual(verify(metadata).archiveSha256, verify(zip()).archiveSha256);
});

test("GNU full-width names accept exact 98-character paths without requiring a nonexistent terminator", () => {
  const bytes = Buffer.from("synthetic full-width member");
  // Python standard-library GNU tar and streaming DEFLATE ZIP reference.
  const independent = Buffer.from("UEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAAMAAAAYXJ0aWZhY3QudGFy7dFNCoNADIbhHCUXqIaOP+ex7YiCdqEj0ttXumsRXI0KfZ/Nl11CviSV6GxRZNknF7+5MhfmStE8/mki0xiqQXWPVWeUpFV0m/07992/s9yuorbHA/68//H1DI0P7V3rqesuc/sIjfa+v/nh6NMAAAAAAAAAAAAAAAAAbHgDUEsHCH1ORUl+AAAAACgAAFBLAQItAxQACAAIAAAAIQB9TkVJfgAAAAAoAAAMAAAAAAAAAAAAIACkgQAAAABhcnRpZmFjdC50YXJQSwUGAAAAAAEAAQA6AAAAuAAAAAAA", "base64");
  const independentLimits = { maxArchiveBytes: independent.length, maxTarBytes: 10240, maxFiles: 1 };
  assert.equal(verifyPagesArtifactContents(independent, [{ path: "a".repeat(98), bytes }], independentLimits).fileCount, 1);
  assert.throws(() => verifyPagesArtifactContents(independent, [{ path: "a".repeat(99), bytes }], independentLimits));
  for (const length of [97, 98]) for (const nested of [false, true]) {
    const path = nested ? `${"a".repeat(length - 2)}/x` : "a".repeat(length);
    const members: Entry[] = [{ name: "./", type: "5", bytes: Buffer.alloc(0) }];
    if (nested) members.push({ name: `./${path.slice(0, -2)}/`, type: "5", bytes: Buffer.alloc(0) });
    members.push({ name: `./${path}`, type: "0", bytes });
    const body = tar(members), offset = (members.length - 1) * 512, archive = zip(body);
    assert.equal(body.subarray(offset, offset + 100).includes(0), length !== 98);
    const report = verifyPagesArtifactContents(archive, [{ path, bytes }],
      { maxArchiveBytes: archive.length, maxTarBytes: body.length, maxFiles: 1 });
    assert.equal(report.fileCount, 1);
    assert.equal(report.directoryCount, nested ? 2 : 1);
    assert.equal(report.totalFileBytes, bytes.length);
  }
});

test("authenticated artifact byte admission and exact candidate-content binding remain independent gates", async () => {
  const extra = [...entries(), { name: "./unapproved", type: "0", bytes: Buffer.from("synthetic unrelated output") }];
  for (const [archive, matches] of [[zip(), true], [zip(tar(extra)), false]] as const) {
    const digest = createHash("sha256").update(archive).digest("hex");
    const options = { repository: "SyntheticOwner/synthetic-library", repositoryId: 101, artifactId: 202,
      artifactName: "github-pages", artifactSha256: digest, publisherRunId: 303,
      publisherHeadCommit: "a".repeat(40), publisherBranch: "main",
      requestTimeoutMs: 10000, maxMetadataBytes: 65536, maxArchiveBytes: archive.length };
    const metadata = { id: 202, name: "github-pages", digest: `sha256:${digest}`, expired: false,
      size_in_bytes: archive.length, workflow_run: { id: 303, repository_id: 101, head_repository_id: 101,
        head_branch: "main", head_sha: "a".repeat(40) } };
    const calls: string[] = [];
    let captured: Uint8Array | undefined;
    const observed = await auditGitHubArtifact(options, async endpoint => {
      calls.push(endpoint);
      if (endpoint.endsWith("/zip")) { captured = Buffer.from(archive); return captured; }
      return Buffer.from(JSON.stringify(metadata));
    });
    assert.deepEqual(calls, ["repos/SyntheticOwner/synthetic-library/actions/artifacts/202",
      "repos/SyntheticOwner/synthetic-library/actions/artifacts/202/zip",
      "repos/SyntheticOwner/synthetic-library/actions/artifacts/202"]);
    assert.equal(observed.stage, "github-artifact-bytes");
    const admitted = captured;
    assert.ok(admitted);
    if (matches) assert.equal(verifyPagesArtifactContents(admitted, files, bounds).archiveSha256, observed.artifactSha256);
    else assert.throws(() => verifyPagesArtifactContents(admitted, files, bounds));
    assert.equal(Object.hasOwn(observed, "sourceCommit"), false);
    assert.equal(Object.hasOwn(observed, "runAttempt"), false);
  }
});
