import * as ImagePicker from "expo-image-picker";

import type { FileCategory } from "@/core/files";

import { es } from "../i18n/es";
import { supabase, WEB_URL } from "./supabase";

/**
 * RN-MOV-07 · cámara y fotografías, pedidas **en el momento de usarlas**;
 * nunca al arrancar. Solo imágenes: el selector no ofrece vídeos, y la app
 * no declara ubicación, micrófono ni contactos. "Escanear un documento" es
 * hacerle una foto con la cámara: sin librería de escaneo ni OCR.
 */
export type PickedImage = {
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
};

export type PickResult =
  | { readonly ok: true; readonly image: PickedImage }
  | { readonly ok: false; readonly reason: "denied" | "cancelled"; readonly message: string };

function fromAsset(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const extension = asset.mimeType === "image/png" ? "png" : "jpg";
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `foto-${Date.now()}.${extension}`,
    mimeType: asset.mimeType ?? "image/jpeg",
    sizeBytes: asset.fileSize ?? 0,
  };
}

export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: "denied", message: es.media.cameraDenied };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
  if (result.canceled || result.assets.length === 0) return { ok: false, reason: "cancelled", message: "" };
  return { ok: true, image: fromAsset(result.assets[0]) };
}

export async function pickPhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: "denied", message: es.media.libraryDenied };
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
  if (result.canceled || result.assets.length === 0) return { ok: false, reason: "cancelled", message: "" };
  return { ok: true, image: fromAsset(result.assets[0]) };
}

export type UploadResult = { readonly ok: true; readonly fileId: string } | { readonly ok: false; readonly error: string };

type RespuestaPreparar = { ok: true; path: string; token: string } | { ok: false; motivo: string };
type RespuestaRegistrar = { ok: true; fileId: string } | { ok: false; motivo: string };

/**
 * La subida pasa por la web (`/api/movil/archivos`), que es donde vive la
 * comprobación de permiso y el `register_file()` de siempre: el teléfono
 * no tiene una puerta propia al bucket (RN-MOV-07). Los bytes van directos
 * a la URL firmada, como en el navegador.
 */
export async function uploadImage(input: {
  establishmentId: string;
  category: FileCategory;
  image: PickedImage;
  name?: string;
  visibility?: "internal" | "shared_with_client";
}): Promise<UploadResult> {
  if (!WEB_URL) return { ok: false, error: es.media.webUrlMissing };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: es.session.expired };

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };

  let sizeBytes = input.image.sizeBytes;
  const blob = await (await fetch(input.image.uri)).blob();
  if (sizeBytes <= 0) sizeBytes = blob.size;

  const preparar = (await (
    await fetch(`${WEB_URL}/api/movil/archivos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        paso: "preparar",
        establishmentId: input.establishmentId,
        category: input.category,
        fileName: input.image.fileName,
        mimeType: input.image.mimeType,
        sizeBytes,
      }),
    })
  ).json()) as RespuestaPreparar;
  if (!preparar.ok) return { ok: false, error: preparar.motivo };

  const subida = await supabase.storage
    .from("files")
    .uploadToSignedUrl(preparar.path, preparar.token, blob, { contentType: input.image.mimeType });
  if (subida.error) return { ok: false, error: es.media.uploadFailed };

  const registrar = (await (
    await fetch(`${WEB_URL}/api/movil/archivos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        paso: "registrar",
        establishmentId: input.establishmentId,
        category: input.category,
        name: input.name ?? input.image.fileName,
        path: preparar.path,
        fileName: input.image.fileName,
        visibility: input.visibility,
      }),
    })
  ).json()) as RespuestaRegistrar;
  if (!registrar.ok) return { ok: false, error: registrar.motivo };

  return { ok: true, fileId: registrar.fileId };
}
