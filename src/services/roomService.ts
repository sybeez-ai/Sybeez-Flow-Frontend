const BASE = "http://localhost:8000";

export interface DesignOption {
  id: string;
  label: string;
}

export interface DesignImage {
  uuid: string;
  url: string;
  width: number;
  height: number;
}

export interface GenerateResult {
  success: boolean;
  room_type: string;
  design_style: string;
  color_scheme: string;
  images: DesignImage[];
}

export interface RoomOptions {
  design_styles: DesignOption[];
  room_types: DesignOption[];
  color_schemes: DesignOption[];
}

export async function fetchRoomOptions(): Promise<RoomOptions> {
  const res = await fetch(`${BASE}/api/v1/room-designer/options`);
  if (!res.ok) throw new Error("Failed to load room designer options");
  return res.json();
}

export async function generateRoomDesign(params: {
  photo: File;
  roomType: string;
  designStyle: string;
  colorScheme: string;
  numImages?: number;
}): Promise<GenerateResult> {
  const fd = new FormData();
  fd.append("photo", params.photo);
  fd.append("room_type", params.roomType);
  fd.append("design_style", params.designStyle);
  fd.append("color_scheme", params.colorScheme);
  fd.append("num_images", String(params.numImages ?? 2));

  const res = await fetch(`${BASE}/api/v1/room-designer/generate`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Generation failed");
  }
  return res.json();
}
