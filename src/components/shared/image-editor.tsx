"use client";

import React from "react";

// Suppress harmless React 19 warnings caused by react-filerobot-image-editor passing `active={false}` to DOM elements.
if (typeof window !== "undefined") {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const errorString = args.map(a => typeof a === 'string' ? a : '').join(' ');
    if (errorString.includes("for a non-boolean attribute `active`")) return;
    if (errorString.includes("A component is changing an uncontrolled input to be controlled")) return;
    originalError.apply(console, args);
  };
}

import FilerobotImageEditor, {
  TABS,
  TOOLS,
} from "react-filerobot-image-editor";
import { Button } from "@/components/ui/button";

interface ImageEditorProps {
  /** The URL of the image to edit */
  sourceUrl: string;
  /** Callback when user finishes editing */
  onSave: (imageFile: File) => void;
  /** Callback to cancel editing */
  onCancel: () => void;
}

export default function ImageEditor({
  sourceUrl,
  onSave,
  onCancel,
}: ImageEditorProps) {
  const handleSave = (editedImageObject: any) => {
    // editedImageObject contains:
    // { imageBase64, fullName, extension, mimeType, imageCanvas }
    if (!editedImageObject.imageCanvas) return;

    editedImageObject.imageCanvas.toBlob((blob: Blob | null) => {
      if (!blob) return;
      const file = new File([blob], editedImageObject.fullName || "edited-image.png", {
        type: editedImageObject.mimeType || "image/png",
      });
      onSave(file);
    }, editedImageObject.mimeType || "image/png");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-[90vw] h-[90vh] bg-background rounded-lg overflow-hidden flex flex-col relative">
        <Button 
          variant="destructive" 
          className="absolute top-2 right-2 z-50 rounded-full w-8 h-8 p-0" 
          onClick={onCancel}
        >
          X
        </Button>
        <div className="flex-1 w-full h-full relative">
          <FilerobotImageEditor
            source={sourceUrl}
            onSave={(editedImageObject, designState) => handleSave(editedImageObject)}
            annotationsCommon={{
              fill: "#ff0000",
            }}
            Text={{ text: "Nhập chữ..." }}
            Rotate={{ angle: 90, componentType: "slider" }}
            Crop={{
              presetsItems: [
                {
                  titleKey: "classicTv",
                  descriptionKey: "4:3",
                  ratio: 4 / 3,
                },
                {
                  titleKey: "cinemascope",
                  descriptionKey: "21:9",
                  ratio: 21 / 9,
                },
                {
                  titleKey: "vertical",
                  descriptionKey: "9:16",
                  ratio: 9 / 16,
                },
                {
                  titleKey: "square",
                  descriptionKey: "1:1",
                  ratio: 1,
                }
              ],
            }}
            tabsIds={[TABS.ADJUST, TABS.ANNOTATE, TABS.WATERMARK, TABS.FILTERS, TABS.FINETUNE]}
            defaultTabId={TABS.ADJUST}
            defaultToolId={TOOLS.CROP}
            savingPixelRatio={1}
            previewPixelRatio={1}
            theme={{
              palette: {
                "bg-primary-active": "#18181b",
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
