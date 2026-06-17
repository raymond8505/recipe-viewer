import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from "react";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "@/lib/imageTypes";
import { uploadRecipeImageFile } from "@/lib/api/recipes";

export interface UseImageUpload {
  file: File | null;
  previewUrl: string | null;
  /** True when the last picked file failed content-type / size validation. */
  error: boolean;
  /** True when a file is staged for upload (drives the "reviewing image" UI). */
  isStaged: boolean;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  /** Clear any prior error and open the OS file picker. */
  open: () => void;
  /** Validate the picked file; on success stage it (file + object-URL preview)
   *  and invoke onAccepted, on failure raise the error flag. */
  onFileChange: (
    e: ChangeEvent<HTMLInputElement>,
    onAccepted?: (file: File) => void,
  ) => void;
  /** Upload the staged file and resolve to its public URL. */
  upload: (recipeId: string) => Promise<string>;
  /** Drop the staged file + preview. */
  clear: () => void;
}

/**
 * Owns image-upload staging for RecipeDetail: the picked File, its object-URL
 * preview, validation against the allowed content types and size cap, and
 * lifecycle revocation of the preview URL. The object URL is revoked purely via
 * the effect cleanup keyed on `previewUrl`, so changing or clearing the preview
 * frees the previous URL without manual bookkeeping at every call site.
 */
export function useImageUpload(maxBytes: number): UseImageUpload {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const open = useCallback(() => {
    setError(false);
    fileInputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setPreviewUrl(null);
  }, []);

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, onAccepted?: (file: File) => void) => {
      const picked = e.target.files?.[0];
      e.target.value = "";
      if (!picked) return;
      if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(picked.type as never)) {
        setError(true);
        return;
      }
      if (picked.size > maxBytes) {
        setError(true);
        return;
      }
      setError(false);
      setFile(picked);
      setPreviewUrl(URL.createObjectURL(picked));
      onAccepted?.(picked);
    },
    [maxBytes],
  );

  const upload = useCallback(
    (recipeId: string) => {
      if (!file) throw new Error("No image staged for upload");
      return uploadRecipeImageFile(recipeId, file);
    },
    [file],
  );

  return {
    file,
    previewUrl,
    error,
    isStaged: file !== null,
    fileInputRef,
    open,
    onFileChange,
    upload,
    clear,
  };
}
