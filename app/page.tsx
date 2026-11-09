"use client";

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";

// Dynamically import PixiSandbox to avoid SSR issues
const PixiSandbox = lazy(() => import("./components/PixiSandbox"));

// Fal Logo SVG component
const FalLogo = ({ className = "", size = 32 }: { className?: string; size?: number }) => (
  <svg 
    viewBox="0 0 624 624" 
    fill="currentColor" 
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    className={className}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M402.365 0C413.17 0.000231771 421.824 8.79229 422.858 19.5596C432.087 115.528 508.461 191.904 604.442 201.124C615.198 202.161 624 210.821 624 221.638V402.362C624 413.179 615.198 421.839 604.442 422.876C508.461 432.096 432.087 508.472 422.858 604.44C421.824 615.208 413.17 624 402.365 624H221.635C210.83 624 202.176 615.208 201.142 604.44C191.913 508.472 115.538 432.096 19.5576 422.876C8.80183 421.839 0 413.179 0 402.362V221.638C0 210.821 8.80183 202.161 19.5576 201.124C115.538 191.904 191.913 115.528 201.142 19.5596C202.176 8.79215 210.83 0 221.635 0H402.365ZM312 124C208.17 124 124 208.17 124 312C124 415.83 208.17 500 312 500C415.83 500 500 415.83 500 312C500 208.17 415.83 124 312 124Z"/>
  </svg>
);

// Fal Spinner component
const FalSpinner = ({ size = 48 }: { size?: number }) => (
  <FalLogo className="fal-spinner" size={size} />
);

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Frame {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Bounding box of actual content (non-transparent pixels) within this frame
  contentBounds: BoundingBox;
}

// Get bounding box of non-transparent pixels in image data
function getContentBounds(ctx: CanvasRenderingContext2D, width: number, height: number): BoundingBox {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) { // Threshold for "visible" pixel
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  // If no content found, return full frame
  if (minX > maxX || minY > maxY) {
    return { x: 0, y: 0, width, height };
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export default function Home() {
  // Step management
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Step 1: Character generation
  const [characterInputMode, setCharacterInputMode] = useState<"text" | "image">("text");
  const [characterPrompt, setCharacterPrompt] = useState("");
  const [inputImageUrl, setInputImageUrl] = useState("");
  const [characterImageUrl, setCharacterImageUrl] = useState<string | null>(null);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);

  // Step 2: Sprite sheet generation (walk + jump + attack + idle)
  const [walkSpriteSheetUrl, setWalkSpriteSheetUrl] = useState<string | null>(null);
  const [jumpSpriteSheetUrl, setJumpSpriteSheetUrl] = useState<string | null>(null);
  const [attackSpriteSheetUrl, setAttackSpriteSheetUrl] = useState<string | null>(null);
  const [idleSpriteSheetUrl, setIdleSpriteSheetUrl] = useState<string | null>(null);
  const [isGeneratingSpriteSheet, setIsGeneratingSpriteSheet] = useState(false);

  // Step 3: Background removal (walk + jump + attack + idle)
  const [walkBgRemovedUrl, setWalkBgRemovedUrl] = useState<string | null>(null);
  const [jumpBgRemovedUrl, setJumpBgRemovedUrl] = useState<string | null>(null);
  const [attackBgRemovedUrl, setAttackBgRemovedUrl] = useState<string | null>(null);
  const [idleBgRemovedUrl, setIdleBgRemovedUrl] = useState<string | null>(null);
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  // Step 4: Frame extraction (grid-based) - walk
  const [walkGridCols, setWalkGridCols] = useState(2);
  const [walkGridRows, setWalkGridRows] = useState(2);
  const [walkVerticalDividers, setWalkVerticalDividers] = useState<number[]>([]);
  const [walkHorizontalDividers, setWalkHorizontalDividers] = useState<number[]>([]);
  const [walkExtractedFrames, setWalkExtractedFrames] = useState<Frame[]>([]);
  const [walkSpriteSheetDimensions, setWalkSpriteSheetDimensions] = useState({ width: 0, height: 0 });
  const walkSpriteSheetRef = useRef<HTMLImageElement>(null);

  // Step 4: Frame extraction (grid-based) - jump
  const [jumpGridCols, setJumpGridCols] = useState(2);
  const [jumpGridRows, setJumpGridRows] = useState(2);
  const [jumpVerticalDividers, setJumpVerticalDividers] = useState<number[]>([]);
  const [jumpHorizontalDividers, setJumpHorizontalDividers] = useState<number[]>([]);
  const [jumpExtractedFrames, setJumpExtractedFrames] = useState<Frame[]>([]);
  const [jumpSpriteSheetDimensions, setJumpSpriteSheetDimensions] = useState({ width: 0, height: 0 });
  const jumpSpriteSheetRef = useRef<HTMLImageElement>(null);

  // Step 4: Frame extraction (grid-based) - attack
  const [attackGridCols, setAttackGridCols] = useState(2);
  const [attackGridRows, setAttackGridRows] = useState(2);
  const [attackVerticalDividers, setAttackVerticalDividers] = useState<number[]>([]);
  const [attackHorizontalDividers, setAttackHorizontalDividers] = useState<number[]>([]);
  const [attackExtractedFrames, setAttackExtractedFrames] = useState<Frame[]>([]);
  const [attackSpriteSheetDimensions, setAttackSpriteSheetDimensions] = useState({ width: 0, height: 0 });
  const attackSpriteSheetRef = useRef<HTMLImageElement>(null);

  // Step 4: Frame extraction (grid-based) - idle
  const [idleGridCols, setIdleGridCols] = useState(2);
  const [idleGridRows, setIdleGridRows] = useState(2);
  const [idleVerticalDividers, setIdleVerticalDividers] = useState<number[]>([]);
  const [idleHorizontalDividers, setIdleHorizontalDividers] = useState<number[]>([]);
  const [idleExtractedFrames, setIdleExtractedFrames] = useState<Frame[]>([]);
  const [idleSpriteSheetDimensions, setIdleSpriteSheetDimensions] = useState({ width: 0, height: 0 });
  const idleSpriteSheetRef = useRef<HTMLImageElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  
  // Which sprite sheet is being edited
  const [activeSheet, setActiveSheet] = useState<"walk" | "jump" | "attack" | "idle">("walk");

  // Step 5: Animation preview
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(8);
  const [direction, setDirection] = useState<"right" | "left">("right");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Step 6: Sandbox
  const [backgroundMode, setBackgroundMode] = useState<"default" | "custom">("default");
  const [customBackgroundLayers, setCustomBackgroundLayers] = useState<{
    layer1Url: string | null;
    layer2Url: string | null;
    layer3Url: string | null;
  }>({ layer1Url: null, layer2Url: null, layer3Url: null });
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);

  // Error handling
  const [error, setError] = useState<string | null>(null);

  // Initialize walk divider positions when grid changes
  useEffect(() => {
    if (walkSpriteSheetDimensions.width > 0) {
      const vPositions: number[] = [];
      for (let i = 1; i < walkGridCols; i++) {
        vPositions.push((i / walkGridCols) * 100);
      }
      setWalkVerticalDividers(vPositions);

      const hPositions: number[] = [];
      for (let i = 1; i < walkGridRows; i++) {
        hPositions.push((i / walkGridRows) * 100);
      }
      setWalkHorizontalDividers(hPositions);
    }
  }, [walkGridCols, walkGridRows, walkSpriteSheetDimensions.width]);

  // Initialize jump divider positions when grid changes
  useEffect(() => {
    if (jumpSpriteSheetDimensions.width > 0) {
      const vPositions: number[] = [];
      for (let i = 1; i < jumpGridCols; i++) {
        vPositions.push((i / jumpGridCols) * 100);
      }
      setJumpVerticalDividers(vPositions);

      const hPositions: number[] = [];
      for (let i = 1; i < jumpGridRows; i++) {
        hPositions.push((i / jumpGridRows) * 100);
      }
      setJumpHorizontalDividers(hPositions);
    }
  }, [jumpGridCols, jumpGridRows, jumpSpriteSheetDimensions.width]);

  // Initialize attack divider positions when grid changes
  useEffect(() => {
    if (attackSpriteSheetDimensions.width > 0) {
      const vPositions: number[] = [];
      for (let i = 1; i < attackGridCols; i++) {
        vPositions.push((i / attackGridCols) * 100);
      }
      setAttackVerticalDividers(vPositions);

      const hPositions: number[] = [];
      for (let i = 1; i < attackGridRows; i++) {
        hPositions.push((i / attackGridRows) * 100);
      }
      setAttackHorizontalDividers(hPositions);
    }
  }, [attackGridCols, attackGridRows, attackSpriteSheetDimensions.width]);

  // Initialize idle divider positions when grid changes
  useEffect(() => {
    if (idleSpriteSheetDimensions.width > 0) {
      const vPositions: number[] = [];
      for (let i = 1; i < idleGridCols; i++) {
        vPositions.push((i / idleGridCols) * 100);
      }
      setIdleVerticalDividers(vPositions);

      const hPositions: number[] = [];
      for (let i = 1; i < idleGridRows; i++) {
        hPositions.push((i / idleGridRows) * 100);
      }
      setIdleHorizontalDividers(hPositions);
    }
  }, [idleGridCols, idleGridRows, idleSpriteSheetDimensions.width]);

  // Extract walk frames when divider positions change
  useEffect(() => {
    if (walkBgRemovedUrl && walkSpriteSheetDimensions.width > 0) {
      extractWalkFrames();
    }
  }, [walkBgRemovedUrl, walkVerticalDividers, walkHorizontalDividers, walkSpriteSheetDimensions]);

  // Extract jump frames when divider positions change
  useEffect(() => {
    if (jumpBgRemovedUrl && jumpSpriteSheetDimensions.width > 0) {
      extractJumpFrames();
    }
  }, [jumpBgRemovedUrl, jumpVerticalDividers, jumpHorizontalDividers, jumpSpriteSheetDimensions]);

  // Extract attack frames when divider positions change
  useEffect(() => {
    if (attackBgRemovedUrl && attackSpriteSheetDimensions.width > 0) {
      extractAttackFrames();
    }
  }, [attackBgRemovedUrl, attackVerticalDividers, attackHorizontalDividers, attackSpriteSheetDimensions]);

  // Extract idle frames when divider positions change
  useEffect(() => {
    if (idleBgRemovedUrl && idleSpriteSheetDimensions.width > 0) {
      extractIdleFrames();
    }
  }, [idleBgRemovedUrl, idleVerticalDividers, idleHorizontalDividers, idleSpriteSheetDimensions]);

  // Animation loop (uses walk frames for preview)
  useEffect(() => {
    if (!isPlaying || walkExtractedFrames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % walkExtractedFrames.length);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, walkExtractedFrames.length]);

  // Draw current frame on canvas (uses walk frames for preview)
  useEffect(() => {
    if (walkExtractedFrames.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frame = walkExtractedFrames[currentFrameIndex];
    if (!frame) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (direction === "left") {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, -canvas.width, 0);
        ctx.restore();
      } else {
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = frame.dataUrl;
  }, [currentFrameIndex, walkExtractedFrames, direction]);

  // Keyboard controls for Step 5
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentStep !== 5) return;

      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
        setDirection("right");
        if (!isPlaying) setIsPlaying(true);
      } else if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
        setDirection("left");
        if (!isPlaying) setIsPlaying(true);
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (currentStep !== 5) return;

      if (
        e.key === "d" ||
        e.key === "D" ||
        e.key === "ArrowRight" ||
        e.key === "a" ||
        e.key === "A" ||
        e.key === "ArrowLeft"
      ) {
        setIsPlaying(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [currentStep, isPlaying]);

  // Sandbox keyboard controls and game loop are now handled inside PixiSandbox component

  // API calls
  const generateCharacter = async () => {
    // Validate based on input mode
    if (characterInputMode === "text" && !characterPrompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
    if (characterInputMode === "image" && !inputImageUrl.trim()) {
      setError("Please enter an image URL");
      return;
    }

    setError(null);
    setIsGeneratingCharacter(true);

    try {
      const requestBody = characterInputMode === "image"
        ? { imageUrl: inputImageUrl, prompt: characterPrompt || undefined }
        : { prompt: characterPrompt };

      const response = await fetch("/api/generate-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate character");
      }

      setCharacterImageUrl(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate character");
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  const generateSpriteSheet = async () => {
    if (!characterImageUrl) return;

    setError(null);
    setIsGeneratingSpriteSheet(true);

    try {
      // Send parallel requests for walk, jump, attack, and idle sprite sheets
      const [walkResponse, jumpResponse, attackResponse, idleResponse] = await Promise.all([
        fetch("/api/generate-sprite-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterImageUrl, type: "walk" }),
        }),
        fetch("/api/generate-sprite-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterImageUrl, type: "jump" }),
        }),
        fetch("/api/generate-sprite-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterImageUrl, type: "attack" }),
        }),
        fetch("/api/generate-sprite-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterImageUrl, type: "idle" }),
        }),
      ]);

      const walkData = await walkResponse.json();
      const jumpData = await jumpResponse.json();
      const attackData = await attackResponse.json();
      const idleData = await idleResponse.json();

      if (!walkResponse.ok) {
        throw new Error(walkData.error || "Failed to generate walk sprite sheet");
      }
      if (!jumpResponse.ok) {
        throw new Error(jumpData.error || "Failed to generate jump sprite sheet");
      }
      if (!attackResponse.ok) {
        throw new Error(attackData.error || "Failed to generate attack sprite sheet");
      }
      if (!idleResponse.ok) {
        throw new Error(idleData.error || "Failed to generate idle sprite sheet");
      }

      setWalkSpriteSheetUrl(walkData.imageUrl);
      setJumpSpriteSheetUrl(jumpData.imageUrl);
      setAttackSpriteSheetUrl(attackData.imageUrl);
      setIdleSpriteSheetUrl(idleData.imageUrl);
      setCompletedSteps((prev) => new Set([...prev, 1]));
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate sprite sheets");
    } finally {
      setIsGeneratingSpriteSheet(false);
    }
  };

  const [regeneratingSpriteSheet, setRegeneratingSpriteSheet] = useState<"walk" | "jump" | "attack" | "idle" | null>(null);

  const regenerateSpriteSheet = async (type: "walk" | "jump" | "attack" | "idle") => {
    if (!characterImageUrl) return;

    setError(null);
    setRegeneratingSpriteSheet(type);

    try {
      const response = await fetch("/api/generate-sprite-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterImageUrl, type }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to generate ${type} sprite sheet`);
      }

      if (type === "walk") {
        setWalkSpriteSheetUrl(data.imageUrl);
      } else if (type === "jump") {
        setJumpSpriteSheetUrl(data.imageUrl);
      } else if (type === "attack") {
        setAttackSpriteSheetUrl(data.imageUrl);
      } else if (type === "idle") {
        setIdleSpriteSheetUrl(data.imageUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to regenerate ${type} sprite sheet`);
    } finally {
      setRegeneratingSpriteSheet(null);
    }
  };

  const removeBackground = async () => {
    if (!walkSpriteSheetUrl || !jumpSpriteSheetUrl || !attackSpriteSheetUrl || !idleSpriteSheetUrl) return;

    setError(null);
    setIsRemovingBg(true);

    try {
      // Send parallel requests for all sprite sheets
      const [walkResponse, jumpResponse, attackResponse, idleResponse] = await Promise.all([
        fetch("/api/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: walkSpriteSheetUrl }),
        }),
        fetch("/api/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: jumpSpriteSheetUrl }),
        }),
        fetch("/api/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: attackSpriteSheetUrl }),
        }),
        fetch("/api/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: idleSpriteSheetUrl }),
        }),
      ]);

      const walkData = await walkResponse.json();
      const jumpData = await jumpResponse.json();
      const attackData = await attackResponse.json();
      const idleData = await idleResponse.json();

      if (!walkResponse.ok) {
        throw new Error(walkData.error || "Failed to remove walk background");
      }
      if (!jumpResponse.ok) {
        throw new Error(jumpData.error || "Failed to remove jump background");
      }
      if (!attackResponse.ok) {
        throw new Error(attackData.error || "Failed to remove attack background");
      }
      if (!idleResponse.ok) {
        throw new Error(idleData.error || "Failed to remove idle background");
      }

      setWalkBgRemovedUrl(walkData.imageUrl);
      setJumpBgRemovedUrl(jumpData.imageUrl);
      setAttackBgRemovedUrl(attackData.imageUrl);
      setIdleBgRemovedUrl(idleData.imageUrl);
      setWalkSpriteSheetDimensions({ width: walkData.width, height: walkData.height });
      setJumpSpriteSheetDimensions({ width: jumpData.width, height: jumpData.height });
      setAttackSpriteSheetDimensions({ width: attackData.width, height: attackData.height });
      setIdleSpriteSheetDimensions({ width: idleData.width, height: idleData.height });
      setCompletedSteps((prev) => new Set([...prev, 2]));
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove background");
    } finally {
      setIsRemovingBg(false);
    }
  };

  const generateBackground = async () => {
    if (!characterImageUrl) return;

    setError(null);
    setIsGeneratingBackground(true);

    try {
      const response = await fetch("/api/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterImageUrl,
          characterPrompt: characterPrompt || "pixel art game character",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate background");
      }

      setCustomBackgroundLayers({
        layer1Url: data.layer1Url,
        layer2Url: data.layer2Url,
        layer3Url: data.layer3Url,
      });
      setBackgroundMode("custom");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate background");
    } finally {
      setIsGeneratingBackground(false);
    }
  };

  const [regeneratingLayer, setRegeneratingLayer] = useState<number | null>(null);

  const regenerateBackgroundLayer = async (layerNumber: 1 | 2 | 3) => {
    if (!characterImageUrl || !characterPrompt || !customBackgroundLayers.layer1Url) return;

    setError(null);
    setRegeneratingLayer(layerNumber);

    try {
      const response = await fetch("/api/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterImageUrl,
          characterPrompt,
          regenerateLayer: layerNumber,
          existingLayers: customBackgroundLayers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to regenerate layer");
      }

      setCustomBackgroundLayers({
        layer1Url: data.layer1Url,
        layer2Url: data.layer2Url,
        layer3Url: data.layer3Url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate layer");
    } finally {
      setRegeneratingLayer(null);
    }
  };

  const extractWalkFrames = useCallback(async () => {
    if (!walkBgRemovedUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const frames: Frame[] = [];
      const colPositions = [0, ...walkVerticalDividers, 100];
      const rowPositions = [0, ...walkHorizontalDividers, 100];

      for (let row = 0; row < rowPositions.length - 1; row++) {
        const startY = Math.round((rowPositions[row] / 100) * img.height);
        const endY = Math.round((rowPositions[row + 1] / 100) * img.height);
        const frameHeight = endY - startY;

        for (let col = 0; col < colPositions.length - 1; col++) {
          const startX = Math.round((colPositions[col] / 100) * img.width);
          const endX = Math.round((colPositions[col + 1] / 100) * img.width);
          const frameWidth = endX - startX;

          const canvas = document.createElement("canvas");
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, startX, startY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            const contentBounds = getContentBounds(ctx, frameWidth, frameHeight);
            frames.push({
              dataUrl: canvas.toDataURL("image/png"),
              x: startX,
              y: startY,
              width: frameWidth,
              height: frameHeight,
              contentBounds,
            });
          }
        }
      }

      setWalkExtractedFrames(frames);
    };

    img.src = walkBgRemovedUrl;
  }, [walkBgRemovedUrl, walkVerticalDividers, walkHorizontalDividers]);

  const extractJumpFrames = useCallback(async () => {
    if (!jumpBgRemovedUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const frames: Frame[] = [];
      const colPositions = [0, ...jumpVerticalDividers, 100];
      const rowPositions = [0, ...jumpHorizontalDividers, 100];

      for (let row = 0; row < rowPositions.length - 1; row++) {
        const startY = Math.round((rowPositions[row] / 100) * img.height);
        const endY = Math.round((rowPositions[row + 1] / 100) * img.height);
        const frameHeight = endY - startY;

        for (let col = 0; col < colPositions.length - 1; col++) {
          const startX = Math.round((colPositions[col] / 100) * img.width);
          const endX = Math.round((colPositions[col + 1] / 100) * img.width);
          const frameWidth = endX - startX;

          const canvas = document.createElement("canvas");
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, startX, startY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            const contentBounds = getContentBounds(ctx, frameWidth, frameHeight);
            frames.push({
              dataUrl: canvas.toDataURL("image/png"),
              x: startX,
              y: startY,
              width: frameWidth,
              height: frameHeight,
              contentBounds,
            });
          }
        }
      }

      setJumpExtractedFrames(frames);
    };

    img.src = jumpBgRemovedUrl;
  }, [jumpBgRemovedUrl, jumpVerticalDividers, jumpHorizontalDividers]);

  const extractAttackFrames = useCallback(async () => {
    if (!attackBgRemovedUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const frames: Frame[] = [];
      const colPositions = [0, ...attackVerticalDividers, 100];
      const rowPositions = [0, ...attackHorizontalDividers, 100];

      for (let row = 0; row < rowPositions.length - 1; row++) {
        const startY = Math.round((rowPositions[row] / 100) * img.height);
        const endY = Math.round((rowPositions[row + 1] / 100) * img.height);
        const frameHeight = endY - startY;

        for (let col = 0; col < colPositions.length - 1; col++) {
          const startX = Math.round((colPositions[col] / 100) * img.width);
          const endX = Math.round((colPositions[col + 1] / 100) * img.width);
          const frameWidth = endX - startX;

          const canvas = document.createElement("canvas");
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, startX, startY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            const contentBounds = getContentBounds(ctx, frameWidth, frameHeight);
            frames.push({
              dataUrl: canvas.toDataURL("image/png"),
              x: startX,
              y: startY,
              width: frameWidth,
              height: frameHeight,
              contentBounds,
            });
          }
        }
      }

      setAttackExtractedFrames(frames);
    };

    img.src = attackBgRemovedUrl;
  }, [attackBgRemovedUrl, attackVerticalDividers, attackHorizontalDividers]);

  const extractIdleFrames = useCallback(async () => {
    if (!idleBgRemovedUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const frames: Frame[] = [];
      const colPositions = [0, ...idleVerticalDividers, 100];
      const rowPositions = [0, ...idleHorizontalDividers, 100];

      for (let row = 0; row < rowPositions.length - 1; row++) {
        const startY = Math.round((rowPositions[row] / 100) * img.height);
        const endY = Math.round((rowPositions[row + 1] / 100) * img.height);
        const frameHeight = endY - startY;

        for (let col = 0; col < colPositions.length - 1; col++) {
          const startX = Math.round((colPositions[col] / 100) * img.width);
          const endX = Math.round((colPositions[col + 1] / 100) * img.width);
          const frameWidth = endX - startX;

          const canvas = document.createElement("canvas");
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, startX, startY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            const contentBounds = getContentBounds(ctx, frameWidth, frameHeight);
            frames.push({
              dataUrl: canvas.toDataURL("image/png"),
              x: startX,
              y: startY,
              width: frameWidth,
              height: frameHeight,
              contentBounds,
            });
          }
        }
      }

      setIdleExtractedFrames(frames);
    };

    img.src = idleBgRemovedUrl;
  }, [idleBgRemovedUrl, idleVerticalDividers, idleHorizontalDividers]);

  // Walk vertical divider drag handling
  const handleWalkVerticalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = walkSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - imgRect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / imgRect.width) * 100));

      const newPositions = [...walkVerticalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setWalkVerticalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Walk horizontal divider drag handling
  const handleWalkHorizontalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = walkSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeY = moveEvent.clientY - imgRect.top;
      const percentage = Math.max(0, Math.min(100, (relativeY / imgRect.height) * 100));

      const newPositions = [...walkHorizontalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setWalkHorizontalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Jump vertical divider drag handling
  const handleJumpVerticalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = jumpSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - imgRect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / imgRect.width) * 100));

      const newPositions = [...jumpVerticalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setJumpVerticalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Jump horizontal divider drag handling
  const handleJumpHorizontalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = jumpSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeY = moveEvent.clientY - imgRect.top;
      const percentage = Math.max(0, Math.min(100, (relativeY / imgRect.height) * 100));

      const newPositions = [...jumpHorizontalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setJumpHorizontalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Attack vertical divider drag handling
  const handleAttackVerticalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = attackSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - imgRect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / imgRect.width) * 100));

      const newPositions = [...attackVerticalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setAttackVerticalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Attack horizontal divider drag handling
  const handleAttackHorizontalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = attackSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeY = moveEvent.clientY - imgRect.top;
      const percentage = Math.max(0, Math.min(100, (relativeY / imgRect.height) * 100));

      const newPositions = [...attackHorizontalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setAttackHorizontalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Idle vertical divider drag handling
  const handleIdleVerticalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = idleSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - imgRect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / imgRect.width) * 100));

      const newPositions = [...idleVerticalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setIdleVerticalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Idle horizontal divider drag handling
  const handleIdleHorizontalDividerDrag = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const imgRect = idleSpriteSheetRef.current?.getBoundingClientRect();
    if (!imgRect) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeY = moveEvent.clientY - imgRect.top;
      const percentage = Math.max(0, Math.min(100, (relativeY / imgRect.height) * 100));

      const newPositions = [...idleHorizontalDividers];
      const minPos = index > 0 ? newPositions[index - 1] + 2 : 2;
      const maxPos = index < newPositions.length - 1 ? newPositions[index + 1] - 2 : 98;
      newPositions[index] = Math.max(minPos, Math.min(maxPos, percentage));
      setIdleHorizontalDividers(newPositions);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Export functions
  const exportWalkSpriteSheet = () => {
    if (!walkBgRemovedUrl) return;
    const link = document.createElement("a");
    link.href = walkBgRemovedUrl;
    link.download = "walk-sprite-sheet.png";
    link.click();
  };

  const exportJumpSpriteSheet = () => {
    if (!jumpBgRemovedUrl) return;
    const link = document.createElement("a");
    link.href = jumpBgRemovedUrl;
    link.download = "jump-sprite-sheet.png";
    link.click();
  };

  const exportAttackSpriteSheet = () => {
    if (!attackBgRemovedUrl) return;
    const link = document.createElement("a");
    link.href = attackBgRemovedUrl;
    link.download = "attack-sprite-sheet.png";
    link.click();
  };

  const exportIdleSpriteSheet = () => {
    if (!idleBgRemovedUrl) return;
    const link = document.createElement("a");
    link.href = idleBgRemovedUrl;
    link.download = "idle-sprite-sheet.png";
    link.click();
  };

  const exportAllFrames = () => {
    walkExtractedFrames.forEach((frame, index) => {
      const link = document.createElement("a");
      link.href = frame.dataUrl;
      link.download = `walk-frame-${index + 1}.png`;
      link.click();
    });
    jumpExtractedFrames.forEach((frame, index) => {
      const link = document.createElement("a");
      link.href = frame.dataUrl;
      link.download = `jump-frame-${index + 1}.png`;
      link.click();
    });
    attackExtractedFrames.forEach((frame, index) => {
      const link = document.createElement("a");
      link.href = frame.dataUrl;
      link.download = `attack-frame-${index + 1}.png`;
      link.click();
    });
    idleExtractedFrames.forEach((frame, index) => {
      const link = document.createElement("a");
      link.href = frame.dataUrl;
      link.download = `idle-frame-${index + 1}.png`;
      link.click();
    });
  };

  const proceedToFrameExtraction = () => {
    setCompletedSteps((prev) => new Set([...prev, 3]));
    setCurrentStep(4);
  };

  const proceedToSandbox = () => {
    setCompletedSteps((prev) => new Set([...prev, 4, 5]));
    setCurrentStep(6);
  };

  return (
    <main className="container">
      <header className="header">
        <div className="header-logo">
          <FalLogo size={36} />
          <h1>Sprite Sheet Creator</h1>
        </div>
        <p>Create pixel art sprite sheets using fal.ai</p>
        <p><a href="/studio" style={{ color: "#a5b4fc", textDecoration: "underline" }}>Open Offline Video → Game Asset Studio</a></p>
      </header>

      {/* Steps indicator */}
      <div className="steps-indicator">
        {[1, 2, 3, 4, 5].map((displayStep) => {
          // Map display step 5 to internal step 6 (sandbox)
          const internalStep = displayStep === 5 ? 6 : displayStep;
          return (
            <div
              key={displayStep}
              className={`step-dot ${currentStep === internalStep ? "active" : ""} ${
                completedSteps.has(internalStep) ? "completed" : ""
              }`}
            />
          );
        })}
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Step 1: Generate Character */}
      {currentStep === 1 && (
        <div className="step-container">
          <h2 className="step-title">
            <span className="step-number">1</span>
            Generate Character
          </h2>

          {/* Input mode tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              className={`btn ${characterInputMode === "text" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setCharacterInputMode("text")}
            >
              Text Prompt
            </button>
            <button
              className={`btn ${characterInputMode === "image" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setCharacterInputMode("image")}
            >
              From Image
            </button>
          </div>

          {characterInputMode === "text" ? (
            <div className="input-group">
              <label htmlFor="prompt">Character Prompt</label>
              <textarea
                id="prompt"
                className="text-input"
                rows={3}
                spellCheck={false}
                placeholder="Describe your pixel art character (e.g., 'pixel art knight with sword and shield, medieval armor, 32-bit style')"
                value={characterPrompt}
                onChange={(e) => setCharacterPrompt(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="input-group">
                <label>Upload Image</label>
                {!inputImageUrl ? (
                  <label
                    htmlFor="imageUpload"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "2rem",
                      border: "2px dashed var(--border-color)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "border-color 0.2s, background 0.2s",
                      background: "var(--bg-secondary)",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent-color)";
                      e.currentTarget.style.background = "var(--bg-tertiary)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "var(--bg-secondary)";
                    }}
                  >
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: "var(--text-tertiary)", marginBottom: "0.75rem" }}
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                      Click to upload an image
                    </span>
                    <span style={{ color: "var(--text-tertiary)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                      PNG, JPG, WEBP supported
                    </span>
                    <input
                      id="imageUpload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setInputImageUrl(event.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                ) : (
                  <div
                    style={{
                      position: "relative",
                      display: "inline-block",
                      padding: "1rem",
                      border: "2px solid var(--border-color)",
                      borderRadius: "8px",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <img
                      src={inputImageUrl}
                      alt="Uploaded preview"
                      style={{ maxWidth: "250px", maxHeight: "250px", borderRadius: "4px", display: "block" }}
                    />
                    <button
                      onClick={() => setInputImageUrl("")}
                      style={{
                        position: "absolute",
                        top: "0.5rem",
                        right: "0.5rem",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        border: "none",
                        background: "var(--bg-primary)",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                        lineHeight: 1,
                      }}
                      title="Remove image"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <div className="input-group" style={{ marginTop: "1rem" }}>
                <label htmlFor="promptOptional">Additional Instructions (optional)</label>
                <textarea
                  id="promptOptional"
                  className="text-input"
                  rows={2}
                  spellCheck={false}
                  placeholder="Any additional instructions for the pixel art conversion..."
                  value={characterPrompt}
                  onChange={(e) => setCharacterPrompt(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="button-group">
            <button
              className="btn btn-primary"
              onClick={generateCharacter}
              disabled={
                isGeneratingCharacter ||
                (characterInputMode === "text" && !characterPrompt.trim()) ||
                (characterInputMode === "image" && !inputImageUrl.trim())
              }
            >
              {isGeneratingCharacter
                ? "Generating..."
                : characterInputMode === "image"
                ? "Convert to Pixel Art"
                : "Generate Character"}
            </button>
          </div>

          {isGeneratingCharacter && (
            <div className="loading">
              <FalSpinner />
              <span className="loading-text">
                {characterInputMode === "image"
                  ? "Converting to pixel art..."
                  : "Generating your character..."}
              </span>
            </div>
          )}

          {characterImageUrl && (
            <>
              <div className="image-preview">
                <img src={characterImageUrl} alt="Generated character" />
              </div>

              <div className="button-group">
                <button
                  className="btn btn-secondary"
                  onClick={generateCharacter}
                  disabled={isGeneratingCharacter}
                >
                  Regenerate
                </button>
                <button
                  className="btn btn-success"
                  onClick={generateSpriteSheet}
                  disabled={isGeneratingSpriteSheet}
                >
                  {isGeneratingSpriteSheet ? "Creating Sprite Sheet..." : "Use for Sprite Sheet →"}
                </button>
              </div>

              {isGeneratingSpriteSheet && (
                <div className="loading">
                  <FalSpinner />
                  <span className="loading-text">Creating sprite sheets...</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Sprite Sheets Generated */}
      {currentStep === 2 && (
        <div className="step-container">
          <h2 className="step-title">
            <span className="step-number">2</span>
            Sprite Sheets Generated
          </h2>

          <p className="description-text">
            Walk, jump, and attack sprite sheets have been generated. If poses don&apos;t look right, try regenerating.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Walk (4 frames)</h4>
              {walkSpriteSheetUrl && (
                <div className="image-preview" style={{ margin: 0, opacity: regeneratingSpriteSheet === "walk" ? 0.5 : 1 }}>
                  <img src={walkSpriteSheetUrl} alt="Walk sprite sheet" />
                </div>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => regenerateSpriteSheet("walk")}
                disabled={isGeneratingSpriteSheet || regeneratingSpriteSheet !== null || isRemovingBg}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.5rem", width: "100%" }}
              >
                {regeneratingSpriteSheet === "walk" ? "Regenerating..." : "Regen Walk"}
              </button>
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Jump (4 frames)</h4>
              {jumpSpriteSheetUrl && (
                <div className="image-preview" style={{ margin: 0, opacity: regeneratingSpriteSheet === "jump" ? 0.5 : 1 }}>
                  <img src={jumpSpriteSheetUrl} alt="Jump sprite sheet" />
                </div>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => regenerateSpriteSheet("jump")}
                disabled={isGeneratingSpriteSheet || regeneratingSpriteSheet !== null || isRemovingBg}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.5rem", width: "100%" }}
              >
                {regeneratingSpriteSheet === "jump" ? "Regenerating..." : "Regen Jump"}
              </button>
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Attack (4 frames)</h4>
              {attackSpriteSheetUrl && (
                <div className="image-preview" style={{ margin: 0, opacity: regeneratingSpriteSheet === "attack" ? 0.5 : 1 }}>
                  <img src={attackSpriteSheetUrl} alt="Attack sprite sheet" />
                </div>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => regenerateSpriteSheet("attack")}
                disabled={isGeneratingSpriteSheet || regeneratingSpriteSheet !== null || isRemovingBg}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.5rem", width: "100%" }}
              >
                {regeneratingSpriteSheet === "attack" ? "Regenerating..." : "Regen Attack"}
              </button>
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Idle (4 frames)</h4>
              {idleSpriteSheetUrl && (
                <div className="image-preview" style={{ margin: 0, opacity: regeneratingSpriteSheet === "idle" ? 0.5 : 1 }}>
                  <img src={idleSpriteSheetUrl} alt="Idle sprite sheet" />
                </div>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => regenerateSpriteSheet("idle")}
                disabled={isGeneratingSpriteSheet || regeneratingSpriteSheet !== null || isRemovingBg}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.5rem", width: "100%" }}
              >
                {regeneratingSpriteSheet === "idle" ? "Regenerating..." : "Regen Idle"}
              </button>
            </div>
          </div>

          {(isGeneratingSpriteSheet || regeneratingSpriteSheet) && (
            <div className="loading">
              <FalSpinner />
              <span className="loading-text">
                {isGeneratingSpriteSheet ? "Regenerating all sprite sheets..." : `Regenerating ${regeneratingSpriteSheet} sprite sheet...`}
              </span>
            </div>
          )}

          <div className="button-group">
            <button className="btn btn-secondary" onClick={() => setCurrentStep(1)}>
              ← Back to Character
            </button>
            <button
              className="btn btn-secondary"
              onClick={generateSpriteSheet}
              disabled={isGeneratingSpriteSheet || isRemovingBg}
            >
              Regenerate All
            </button>
            <button
              className="btn btn-success"
              onClick={removeBackground}
              disabled={isRemovingBg || isGeneratingSpriteSheet || !walkSpriteSheetUrl || !jumpSpriteSheetUrl || !attackSpriteSheetUrl}
            >
              {isRemovingBg ? "Removing Backgrounds..." : "Remove Backgrounds →"}
            </button>
          </div>

          {isRemovingBg && (
            <div className="loading">
              <FalSpinner />
              <span className="loading-text">Removing backgrounds from all sheets...</span>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Background Removed */}
      {currentStep === 3 && (
        <div className="step-container">
          <h2 className="step-title">
            <span className="step-number">3</span>
            Backgrounds Removed
          </h2>

          <p className="description-text">
            Backgrounds have been removed. Now let&apos;s extract the individual frames.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Walk Cycle</h4>
              {walkBgRemovedUrl && (
                <div className="image-preview" style={{ margin: 0 }}>
                  <img src={walkBgRemovedUrl} alt="Walk sprite sheet with background removed" />
                </div>
              )}
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Jump</h4>
              {jumpBgRemovedUrl && (
                <div className="image-preview" style={{ margin: 0 }}>
                  <img src={jumpBgRemovedUrl} alt="Jump sprite sheet with background removed" />
                </div>
              )}
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Attack</h4>
              {attackBgRemovedUrl && (
                <div className="image-preview" style={{ margin: 0 }}>
                  <img src={attackBgRemovedUrl} alt="Attack sprite sheet with background removed" />
                </div>
              )}
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Idle</h4>
              {idleBgRemovedUrl && (
                <div className="image-preview" style={{ margin: 0 }}>
                  <img src={idleBgRemovedUrl} alt="Idle sprite sheet with background removed" />
                </div>
              )}
            </div>
          </div>

          <div className="button-group">
            <button className="btn btn-secondary" onClick={() => setCurrentStep(2)}>
              ← Back
            </button>
            <button className="btn btn-success" onClick={proceedToFrameExtraction}>
              Extract Frames →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Frame Extraction */}
      {currentStep === 4 && (
        <div className="step-container">
          <h2 className="step-title">
            <span className="step-number">4</span>
            Extract Frames
          </h2>

          <p className="description-text">
            Drag the dividers to adjust frame boundaries. Purple = columns, pink = rows.
          </p>

          {/* Tab buttons */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              className={`btn ${activeSheet === "walk" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveSheet("walk")}
            >
              Walk Cycle
            </button>
            <button
              className={`btn ${activeSheet === "jump" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveSheet("jump")}
            >
              Jump
            </button>
            <button
              className={`btn ${activeSheet === "attack" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveSheet("attack")}
            >
              Attack
            </button>
            <button
              className={`btn ${activeSheet === "idle" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveSheet("idle")}
            >
              Idle
            </button>
          </div>

          {/* Walk frame extraction */}
          {activeSheet === "walk" && (
            <>
              <div className="frame-controls">
                <label htmlFor="walkGridCols">Columns:</label>
                <input
                  id="walkGridCols"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={walkGridCols}
                  onChange={(e) => setWalkGridCols(Math.max(1, Math.min(8, parseInt(e.target.value) || 3)))}
                />
                <label htmlFor="walkGridRows" style={{ marginLeft: "1rem" }}>Rows:</label>
                <input
                  id="walkGridRows"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={walkGridRows}
                  onChange={(e) => setWalkGridRows(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <span style={{ marginLeft: "1rem", color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
                  ({walkGridCols * walkGridRows} frames)
                </span>
              </div>

              {walkBgRemovedUrl && (
                <div className="frame-extractor" ref={containerRef}>
                  <div className="sprite-sheet-container">
                    <img
                      ref={walkSpriteSheetRef}
                      src={walkBgRemovedUrl}
                      alt="Walk sprite sheet"
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        setWalkSpriteSheetDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                      }}
                    />
                    <div className="divider-overlay">
                      {walkVerticalDividers.map((pos, index) => (
                        <div
                          key={`wv-${index}`}
                          className="divider-line divider-vertical"
                          style={{ left: `${pos}%` }}
                          onMouseDown={(e) => handleWalkVerticalDividerDrag(index, e)}
                        />
                      ))}
                      {walkHorizontalDividers.map((pos, index) => (
                        <div
                          key={`wh-${index}`}
                          className="divider-line divider-horizontal"
                          style={{ top: `${pos}%` }}
                          onMouseDown={(e) => handleWalkHorizontalDividerDrag(index, e)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {walkExtractedFrames.length > 0 && (
                <div className="frames-preview">
                  {walkExtractedFrames.map((frame, index) => (
                    <div key={index} className="frame-thumb">
                      <img src={frame.dataUrl} alt={`Walk frame ${index + 1}`} />
                      <div className="frame-label">Walk {index + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Jump frame extraction */}
          {activeSheet === "jump" && (
            <>
              <div className="frame-controls">
                <label htmlFor="jumpGridCols">Columns:</label>
                <input
                  id="jumpGridCols"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={jumpGridCols}
                  onChange={(e) => setJumpGridCols(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <label htmlFor="jumpGridRows" style={{ marginLeft: "1rem" }}>Rows:</label>
                <input
                  id="jumpGridRows"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={jumpGridRows}
                  onChange={(e) => setJumpGridRows(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <span style={{ marginLeft: "1rem", color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
                  ({jumpGridCols * jumpGridRows} frames)
                </span>
              </div>

              {jumpBgRemovedUrl && (
                <div className="frame-extractor">
                  <div className="sprite-sheet-container">
                    <img
                      ref={jumpSpriteSheetRef}
                      src={jumpBgRemovedUrl}
                      alt="Jump sprite sheet"
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        setJumpSpriteSheetDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                      }}
                    />
                    <div className="divider-overlay">
                      {jumpVerticalDividers.map((pos, index) => (
                        <div
                          key={`jv-${index}`}
                          className="divider-line divider-vertical"
                          style={{ left: `${pos}%` }}
                          onMouseDown={(e) => handleJumpVerticalDividerDrag(index, e)}
                        />
                      ))}
                      {jumpHorizontalDividers.map((pos, index) => (
                        <div
                          key={`jh-${index}`}
                          className="divider-line divider-horizontal"
                          style={{ top: `${pos}%` }}
                          onMouseDown={(e) => handleJumpHorizontalDividerDrag(index, e)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {jumpExtractedFrames.length > 0 && (
                <div className="frames-preview">
                  {jumpExtractedFrames.map((frame, index) => (
                    <div key={index} className="frame-thumb">
                      <img src={frame.dataUrl} alt={`Jump frame ${index + 1}`} />
                      <div className="frame-label">Jump {index + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Attack frame extraction */}
          {activeSheet === "attack" && (
            <>
              <div className="frame-controls">
                <label htmlFor="attackGridCols">Columns:</label>
                <input
                  id="attackGridCols"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={attackGridCols}
                  onChange={(e) => setAttackGridCols(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <label htmlFor="attackGridRows" style={{ marginLeft: "1rem" }}>Rows:</label>
                <input
                  id="attackGridRows"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={attackGridRows}
                  onChange={(e) => setAttackGridRows(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <span style={{ marginLeft: "1rem", color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
                  ({attackGridCols * attackGridRows} frames)
                </span>
              </div>

              {attackBgRemovedUrl && (
                <div className="frame-extractor">
                  <div className="sprite-sheet-container">
                    <img
                      ref={attackSpriteSheetRef}
                      src={attackBgRemovedUrl}
                      alt="Attack sprite sheet"
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        setAttackSpriteSheetDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                      }}
                    />
                    <div className="divider-overlay">
                      {attackVerticalDividers.map((pos, index) => (
                        <div
                          key={`av-${index}`}
                          className="divider-line divider-vertical"
                          style={{ left: `${pos}%` }}
                          onMouseDown={(e) => handleAttackVerticalDividerDrag(index, e)}
                        />
                      ))}
                      {attackHorizontalDividers.map((pos, index) => (
                        <div
                          key={`ah-${index}`}
                          className="divider-line divider-horizontal"
                          style={{ top: `${pos}%` }}
                          onMouseDown={(e) => handleAttackHorizontalDividerDrag(index, e)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {attackExtractedFrames.length > 0 && (
                <div className="frames-preview">
                  {attackExtractedFrames.map((frame, index) => (
                    <div key={index} className="frame-thumb">
                      <img src={frame.dataUrl} alt={`Attack frame ${index + 1}`} />
                      <div className="frame-label">Attack {index + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Idle frame extraction */}
          {activeSheet === "idle" && (
            <>
              <div className="frame-controls">
                <label htmlFor="idleGridCols">Columns:</label>
                <input
                  id="idleGridCols"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={idleGridCols}
                  onChange={(e) => setIdleGridCols(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <label htmlFor="idleGridRows" style={{ marginLeft: "1rem" }}>Rows:</label>
                <input
                  id="idleGridRows"
                  type="number"
                  className="frame-count-input"
                  min={1}
                  max={8}
                  value={idleGridRows}
                  onChange={(e) => setIdleGridRows(Math.max(1, Math.min(8, parseInt(e.target.value) || 2)))}
                />
                <span style={{ marginLeft: "1rem", color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
                  ({idleGridCols * idleGridRows} frames)
                </span>
              </div>

              {idleBgRemovedUrl && (
                <div className="frame-extractor">
                  <div className="sprite-sheet-container">
                    <img
                      ref={idleSpriteSheetRef}
                      src={idleBgRemovedUrl}
                      alt="Idle sprite sheet"
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        setIdleSpriteSheetDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                      }}
                    />
                    <div className="divider-overlay">
                      {idleVerticalDividers.map((pos, index) => (
                        <div
                          key={`iv-${index}`}
                          className="divider-line divider-vertical"
                          style={{ left: `${pos}%` }}
                          onMouseDown={(e) => handleIdleVerticalDividerDrag(index, e)}
                        />
                      ))}
                      {idleHorizontalDividers.map((pos, index) => (
                        <div
                          key={`ih-${index}`}
                          className="divider-line divider-horizontal"
                          style={{ top: `${pos}%` }}
                          onMouseDown={(e) => handleIdleHorizontalDividerDrag(index, e)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {idleExtractedFrames.length > 0 && (
                <div className="frames-preview">
                  {idleExtractedFrames.map((frame, index) => (
                    <div key={index} className="frame-thumb">
                      <img src={frame.dataUrl} alt={`Idle frame ${index + 1}`} />
                      <div className="frame-label">Idle {index + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="button-group">
            <button className="btn btn-secondary" onClick={() => setCurrentStep(3)}>
              ← Back
            </button>
            <button
              className="btn btn-success"
              onClick={proceedToSandbox}
              disabled={walkExtractedFrames.length === 0 || jumpExtractedFrames.length === 0 || attackExtractedFrames.length === 0 || idleExtractedFrames.length === 0}
            >
              Try in Sandbox →
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Animation Preview & Export */}
      {currentStep === 5 && (
        <div className="step-container">
          <h2 className="step-title">
            <span className="step-number">5</span>
            Preview & Export
          </h2>

          <p className="description-text">Walk animation preview. Test both walk and jump in the sandbox!</p>

          <div className="animation-preview">
            <div className="animation-canvas-container">
              <canvas ref={canvasRef} className="animation-canvas" />
              <div className="direction-indicator">
                {direction === "right" ? "→ Walking Right" : "← Walking Left"}
              </div>
            </div>

            <div className="keyboard-hint">
              Hold <kbd>D</kbd> or <kbd>→</kbd> to walk right | Hold <kbd>A</kbd> or <kbd>←</kbd> to walk left | <kbd>Space</kbd> to stop
            </div>

            <div className="animation-controls">
              <button
                className={`btn ${isPlaying ? "btn-secondary" : "btn-primary"}`}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? "Stop" : "Play"}
              </button>

              <div className="fps-control">
                <label>FPS: {fps}</label>
                <input
                  type="range"
                  className="fps-slider"
                  min={1}
                  max={24}
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", margin: "1rem 0" }}>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Walk Frames</h4>
              <div className="frames-preview" style={{ margin: 0, justifyContent: "flex-start" }}>
                {walkExtractedFrames.map((frame, index) => (
                  <div
                    key={index}
                    className={`frame-thumb ${currentFrameIndex === index ? "active" : ""}`}
                    onClick={() => setCurrentFrameIndex(index)}
                  >
                    <img src={frame.dataUrl} alt={`Walk ${index + 1}`} />
                    <div className="frame-label">{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Jump Frames</h4>
              <div className="frames-preview" style={{ margin: 0, justifyContent: "flex-start" }}>
                {jumpExtractedFrames.map((frame, index) => (
                  <div key={index} className="frame-thumb">
                    <img src={frame.dataUrl} alt={`Jump ${index + 1}`} />
                    <div className="frame-label">{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Attack Frames</h4>
              <div className="frames-preview" style={{ margin: 0, justifyContent: "flex-start" }}>
                {attackExtractedFrames.map((frame, index) => (
                  <div key={index} className="frame-thumb">
                    <img src={frame.dataUrl} alt={`Attack ${index + 1}`} />
                    <div className="frame-label">{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ marginBottom: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Idle Frames</h4>
              <div className="frames-preview" style={{ margin: 0, justifyContent: "flex-start" }}>
                {idleExtractedFrames.map((frame, index) => (
                  <div key={index} className="frame-thumb">
                    <img src={frame.dataUrl} alt={`Idle ${index + 1}`} />
                    <div className="frame-label">{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="export-section">
            <h3 style={{ marginBottom: "0.75rem" }}>Export</h3>
            <div className="export-options">
              <button className="btn btn-primary" onClick={exportWalkSpriteSheet}>
                Walk Sheet
              </button>
              <button className="btn btn-primary" onClick={exportJumpSpriteSheet}>
                Jump Sheet
              </button>
              <button className="btn btn-primary" onClick={exportAttackSpriteSheet}>
                Attack Sheet
              </button>
              <button className="btn btn-primary" onClick={exportIdleSpriteSheet}>
                Idle Sheet
              </button>
              <button className="btn btn-secondary" onClick={exportAllFrames}>
                All Frames
              </button>
            </div>
          </div>

          <div className="button-group" style={{ marginTop: "1.5rem" }}>
            <button className="btn btn-secondary" onClick={() => setCurrentStep(4)}>
              ← Back to Frame Extraction
            </button>
            <button
              className="btn btn-success"
              onClick={() => {
                setCompletedSteps((prev) => new Set([...prev, 5]));
                setCurrentStep(6);
              }}
            >
              Try in Sandbox →
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Sandbox */}
      {currentStep === 6 && (
        <div className="step-container">
          <h2 className="step-title">
            <span className="step-number">5</span>
            Sandbox
          </h2>

          <p className="description-text">
            Walk, jump, and attack with your character! Use the keyboard to control movement.
          </p>

          {/* Background mode tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              className={`btn ${backgroundMode === "default" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setBackgroundMode("default")}
            >
              Default Background
            </button>
            <button
              className={`btn ${backgroundMode === "custom" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setBackgroundMode("custom")}
            >
              Custom Background
            </button>
          </div>

          {/* Custom background generation UI */}
          {backgroundMode === "custom" && (
            <div style={{ marginBottom: "1rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "8px" }}>
              {!customBackgroundLayers.layer1Url ? (
                <>
                  <p style={{ marginBottom: "0.75rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    Generate a custom parallax background that matches your character&apos;s world.
                  </p>
                  <button
                    className="btn btn-success"
                    onClick={generateBackground}
                    disabled={isGeneratingBackground}
                  >
                    {isGeneratingBackground ? "Generating Background..." : "Generate Custom Background"}
                  </button>
                  {isGeneratingBackground && (
                    <div className="loading" style={{ marginTop: "1rem" }}>
                      <FalSpinner />
                      <span className="loading-text">Creating 3-layer parallax background (this may take a moment)...</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={{ marginBottom: "0.75rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    Custom background generated! Click on a layer to regenerate just that one.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>Layer 1 (Sky)</div>
                      <img src={customBackgroundLayers.layer1Url} alt="Background layer" style={{ width: "100%", borderRadius: "4px", opacity: regeneratingLayer === 1 ? 0.5 : 1 }} />
                      <button
                        className="btn btn-secondary"
                        onClick={() => regenerateBackgroundLayer(1)}
                        disabled={isGeneratingBackground || regeneratingLayer !== null}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.25rem", width: "100%" }}
                      >
                        {regeneratingLayer === 1 ? "..." : "Regen"}
                      </button>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>Layer 2 (Mid)</div>
                      <img src={customBackgroundLayers.layer2Url!} alt="Midground layer" style={{ width: "100%", borderRadius: "4px", background: "#333", opacity: regeneratingLayer === 2 ? 0.5 : 1 }} />
                      <button
                        className="btn btn-secondary"
                        onClick={() => regenerateBackgroundLayer(2)}
                        disabled={isGeneratingBackground || regeneratingLayer !== null}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.25rem", width: "100%" }}
                      >
                        {regeneratingLayer === 2 ? "..." : "Regen"}
                      </button>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>Layer 3 (Front)</div>
                      <img src={customBackgroundLayers.layer3Url!} alt="Foreground layer" style={{ width: "100%", borderRadius: "4px", background: "#333", opacity: regeneratingLayer === 3 ? 0.5 : 1 }} />
                      <button
                        className="btn btn-secondary"
                        onClick={() => regenerateBackgroundLayer(3)}
                        disabled={isGeneratingBackground || regeneratingLayer !== null}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", marginTop: "0.25rem", width: "100%" }}
                      >
                        {regeneratingLayer === 3 ? "..." : "Regen"}
                      </button>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={generateBackground}
                    disabled={isGeneratingBackground || regeneratingLayer !== null}
                    style={{ fontSize: "0.85rem" }}
                  >
                    {isGeneratingBackground ? "Regenerating All..." : "Regenerate All Layers"}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="sandbox-container">
            <Suspense fallback={
              <div className="loading">
                <FalSpinner />
                <span className="loading-text">Loading sandbox...</span>
              </div>
            }>
              <PixiSandbox
                walkFrames={walkExtractedFrames}
                jumpFrames={jumpExtractedFrames}
                attackFrames={attackExtractedFrames}
                idleFrames={idleExtractedFrames}
                fps={fps}
                customBackgroundLayers={backgroundMode === "custom" ? customBackgroundLayers : undefined}
              />
            </Suspense>
          </div>

          <div className="keyboard-hint" style={{ marginTop: "1rem" }}>
            <kbd>A</kbd>/<kbd>←</kbd> walk left | <kbd>D</kbd>/<kbd>→</kbd> walk right | <kbd>W</kbd>/<kbd>↑</kbd> jump | <kbd>J</kbd> attack
          </div>

          <div className="animation-controls" style={{ marginTop: "1rem" }}>
            <div className="fps-control">
              <label>Animation Speed (FPS): {fps}</label>
              <input
                type="range"
                className="fps-slider"
                min={4}
                max={16}
                value={fps}
                onChange={(e) => setFps(parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="button-group" style={{ marginTop: "1.5rem" }}>
            <button className="btn btn-secondary" onClick={() => setCurrentStep(4)}>
              ← Back to Frame Extraction
            </button>
            <button className="btn btn-secondary" onClick={() => {
              // Reset everything
              setCurrentStep(1);
              setCompletedSteps(new Set());
              setCharacterImageUrl(null);
              setWalkSpriteSheetUrl(null);
              setJumpSpriteSheetUrl(null);
              setAttackSpriteSheetUrl(null);
              setIdleSpriteSheetUrl(null);
              setWalkBgRemovedUrl(null);
              setJumpBgRemovedUrl(null);
              setAttackBgRemovedUrl(null);
              setIdleBgRemovedUrl(null);
              setWalkExtractedFrames([]);
              setJumpExtractedFrames([]);
              setAttackExtractedFrames([]);
              setIdleExtractedFrames([]);
              setCharacterPrompt("");
              setInputImageUrl("");
              setCharacterInputMode("text");
              setBackgroundMode("default");
              setCustomBackgroundLayers({ layer1Url: null, layer2Url: null, layer3Url: null });
            }}>
              Start New Sprite
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
