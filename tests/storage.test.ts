/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { formatBytes } from "../src/utils/storage.ts";

Deno.test("formatBytes - 0 bytes", () => {
  assertEquals(formatBytes(0), "0 B");
});

Deno.test("formatBytes - 1 KB", () => {
  assertEquals(formatBytes(1024), "1.0 KB");
});

Deno.test("formatBytes - 1 MB", () => {
  assertEquals(formatBytes(1024 * 1024), "1.0 MB");
});

Deno.test("formatBytes - 1.5 KB", () => {
  assertEquals(formatBytes(1536), "1.5 KB");
});

Deno.test("formatBytes - 2.5 GB", () => {
  assertEquals(formatBytes(1024 * 1024 * 1024 * 2.5), "2.5 GB");
});

Deno.test("formatBytes - 1 TB", () => {
  assertEquals(formatBytes(1024 * 1024 * 1024 * 1024), "1.0 TB");
});
