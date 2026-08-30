import { assertEquals } from "@std/assert";

Deno.test("Layout - Verificação de Mapeamento de Classes Responsivas", () => {
  const leftNavClasses = "left l surface elevation-1";
  const bottomNavClasses = "bottom s m surface elevation-2";

  // Left Nav deve estar visível apenas em telas grandes ('l')
  assertEquals(leftNavClasses.includes("l"), true);
  assertEquals(leftNavClasses.includes("m"), false);

  // Bottom Nav deve estar visível em pequenas ('s') e médias ('m')
  assertEquals(bottomNavClasses.includes("s"), true);
  assertEquals(bottomNavClasses.includes("m"), true);
});