"""
Development-time generator for the cinematic key-art (Bible §41.2) — run once, assets are bundled with the app.

    cd /app/backend && python scripts/gen_cinematics.py [variant ...]

Writes /app/frontend/assets/cinematics/<variant>_<n>.jpg (portrait, ≤1080 px tall, JPEG q85). Existing files are kept
unless --force is passed. Uses Gemini image generation (Nano Banana) through the Emergent universal key.
"""
import asyncio
import base64
import io
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT = Path("/app/frontend/assets/cinematics")
MODEL = "gemini-3.1-flash-image-preview"
STYLE = (
    " Epic dark-fantasy film still, cinematic lighting, volumetric light and haze, ultra detailed, painterly realism, "
    "dramatic wide-angle composition, 35mm anamorphic look, moody color grading. Vertical portrait orientation, 9:16 aspect ratio. "
    "No text, no letters, no logos, no watermark, no borders."
)

SHOTS: dict[str, list[str]] = {
    "intro": [
        "A vast fantasy realm seen from a high ridge at dawn: rivers, forests, snowy mountains and many small medieval castles on hills, distant armies marching with banners, golden mist.",
        "Rival medieval houses raising a great stone castle and its walls on a hill at dusk, masons and knights, heraldic banners with crests, warm torchlight.",
        "A colossal dragon descending from stormy mountains, breathing fire over a night battlefield, knights fleeing, embers filling the sky.",
        "A colossal ancient stepped pyramid awakening in the heart of a fantasy realm, a pillar of golden light rising from its apex, braziers igniting, dawn clouds.",
        "Several medieval armies with different heraldic banners converging on a great pyramid across a plain at sunset, alliance war council with lords on horseback.",
        "A lone armored lord holding a banner on a hilltop at sunrise, overlooking a fantasy realm with a castle, forests and a distant pyramid, heroic, hopeful golden light.",
    ],
    "standard": [
        "A vast medieval army marching in a long column through a moonlit valley at night, hundreds of torches glowing, banners and spears, distant snowy mountains, low fog over the ground.",
        "Close-up of armored medieval knights marching at night, faces lit by torchlight, determined expressions, spears and round shields, embers drifting in the air.",
    ],
    "falcon": [
        "A majestic falcon with wings spread soaring above a marching medieval army at twilight, seen from above the column, torches like a river of light below, purple and orange sky.",
        "Low angle: medieval cavalry galloping at dusk with a falcon silhouetted against a huge full moon, dust and mist, banners streaming.",
    ],
    "major": [
        "A colossal medieval army stretching to the horizon at dusk: siege towers, catapults, armored war elephants and thousands of torches, storm clouds lit from below.",
        "Close-up of an armored war elephant with a fortified howdah advancing beside rolling catapults at night, torches and rain, warriors shouting.",
    ],
    "dragon": [
        "A gigantic dragon descending from a stormy night sky above a marching medieval army, its fire breath illuminating the clouds and the soldiers below, lightning in the distance.",
        "Extreme close-up of a dragon's head roaring a torrent of fire over a night battlefield, embers and sparks, armored knights small below, orange glow on scales.",
    ],
    "angel": [
        "A radiant winged angel warrior in golden armor leading a medieval army at dawn, wings of light spread wide, beams of sunlight through clouds, soldiers looking up in awe.",
        "Close-up of an angelic warrior with a flaming sword raised, luminous feathered wings, golden light rays, medieval army with banners behind.",
    ],
    "demon": [
        "A monstrous horned demon towering over a marching medieval army under a blood-red sky, lava cracks in the ground, ash falling, army with torches and black banners.",
        "Close-up of a demon's face with burning eyes and horns, smoke and embers, armored warriors with torches marching below at night.",
    ],
    "conquest": [
        "A medieval stone castle at sunrise after a victorious siege, soldiers on the keep raising a great banner, cheering army below with raised swords, golden light and mist.",
        "Close-up of victorious medieval knights cheering with raised swords and spears, a banner waving against a golden sunrise, castle towers behind, sparks in the air.",
    ],
    "pyramid": [
        "A colossal ancient stepped stone pyramid at sunrise with a pillar of golden light rising from its apex into the clouds, a medieval army gathered at its base with banners, mist.",
        "Warriors in medieval armor ascending the grand stairway of a giant stepped pyramid at dawn, golden light from the summit, braziers burning, banners waving.",
    ],
}


def to_jpeg(png: bytes, path: Path) -> tuple[int, int]:
    im = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = im.size
    if h > 1080:
        im = im.resize((round(w * 1080 / h), 1080), Image.LANCZOS)
    im.save(path, "JPEG", quality=85, optimize=True, progressive=True)
    return im.size


async def gen_one(variant: str, idx: int, prompt: str, force: bool) -> None:
    path = OUT / f"{variant}_{idx}.jpg"
    if path.exists() and not force:
        print(f"skip {path.name} (exists)")
        return
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"cin-{variant}-{idx}", system_message="You are a concept artist for an epic fantasy strategy game.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    for attempt in range(3):
        try:
            _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt + STYLE))
            if images:
                size = to_jpeg(base64.b64decode(images[0]["data"]), path)
                print(f"ok   {path.name} {size[0]}x{size[1]} {path.stat().st_size // 1024} KB")
                return
            print(f"warn {path.name}: no image returned (attempt {attempt + 1})")
        except Exception as e:  # noqa: BLE001
            print(f"err  {path.name}: {e!s:.200} (attempt {attempt + 1})")
        await asyncio.sleep(2)


async def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    variants = args or list(SHOTS)
    for v in variants:
        for i, prompt in enumerate(SHOTS[v]):
            await gen_one(v, i, prompt, force)


if __name__ == "__main__":
    asyncio.run(main())
