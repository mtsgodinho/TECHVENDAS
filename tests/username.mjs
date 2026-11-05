import { test } from "node:test";
import assert from "node:assert/strict";
import { loginAddress } from "../lib/username.ts";
test("usuário é convertido de forma determinística, sem solicitar email real", () => {
  assert.equal(loginAddress(" Admin "), "admin@techvendas.invalid");
  assert.equal(
    loginAddress("Maria.Silva-01"),
    "maria.silva-01@techvendas.invalid",
  );
  assert.equal(loginAddress("atendente_1"), "atendente_1@techvendas.invalid");
  assert.equal(
    loginAddress("a".repeat(32)),
    "a".repeat(32) + "@techvendas.invalid",
  );
});
test("rejeita email, nomes ambíguos e caracteres fora do padrão", () => {
  for (const name of [
    "",
    "ab",
    "a".repeat(33),
    "admin@example.com",
    "josé",
    "maria silva",
    "1admin",
    "a/b",
    "admin\nother",
  ])
    assert.throws(() => loginAddress(name));
});
