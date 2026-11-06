"use client";
import { useState, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/crm";
export default function MyProfile({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [name, setName] = useState(profile.full_name),
    [photo, setPhoto] = useState<string | null>(profile.avatar_url || null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [confirm, setConfirm] = useState("");
  async function image(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Selecione JPG, PNG ou WebP de até 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error();
      const size = Math.min(bitmap.width, bitmap.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(
        bitmap,
        (bitmap.width - size) / 2,
        (bitmap.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      bitmap.close();
      const result = canvas.toDataURL("image/jpeg", 0.75);
      if (result.length > 65000) throw Error();
      setPhoto(result);
    } catch {
      setMessage("Não foi possível preparar a foto. Tente outra imagem.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_my_profile", {
        p_full_name: name.trim(),
        p_avatar_url: photo,
      });
      if (error) throw error;
      onSaved({ ...profile, full_name: name.trim(), avatar_url: photo });
      setMessage("Perfil atualizado.");
    } catch {
      setMessage(
        "Não foi possível salvar o perfil. Confira a conexão e se a atualização 006_self_profile.sql foi aplicada.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setMessage("");
    if (password.length < 8 || password.length > 128 || password !== confirm) {
      setMessage(
        "Informe uma senha de 8 a 128 caracteres e repita a mesma senha na confirmação.",
      );
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user?.email) throw Error("session");
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const check = await verifier.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (check.error || check.data.user?.id !== user.id) {
        setMessage("A senha atual não confere.");
        return;
      }
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setCurrent("");
      setPassword("");
      setConfirm("");
      setMessage("Senha alterada. Use a nova senha no próximo acesso.");
    } catch {
      setMessage(
        "Não foi possível alterar a senha. Confira sua sessão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-panel">
      <h2>Meu perfil</h2>
      <p className="muted">Atualize como você aparece para a equipe.</p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <form onSubmit={save}>
        {photo ? (
          <img
            className="profile-photo"
            src={photo}
            alt="Prévia da foto de perfil"
            width={112}
            height={112}
          />
        ) : (
          <div className="profile-photo profile-initial">
            {name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <label>
          Foto de perfil
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={image}
            disabled={busy}
          />
        </label>
        <p className="muted">
          JPG, PNG ou WebP, até 5 MB. A foto será recortada no centro.
        </p>
        {photo && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setPhoto(null)}
          >
            Remover foto
          </button>
        )}
        <label>
          Nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            disabled={busy}
          />
        </label>
        <button disabled={busy || !name.trim()}>Salvar perfil</button>
      </form>
      <form onSubmit={changePassword}>
        <h3>Alterar senha</h3>
        <label>
          Senha atual
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          Nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={128}
            required
            disabled={busy}
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            maxLength={128}
            required
            disabled={busy}
          />
        </label>
        <button disabled={busy}>Alterar senha</button>
      </form>
    </section>
  );
}
