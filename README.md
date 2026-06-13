# control3D

Monorepo for the 3D Object Management MVP.

## Quick start

1. Install dependencies:
   - `yarn install`
2. Start app:
   - `yarn dev`
3. Local database:
   - SQLite file is created automatically at `apps/web/data/control3d.sqlite`
4. Local uploads:
   - Uploaded model files are stored under `apps/web/public/uploads/models`
5. Download "Blender"
   - Important and create .env.local -> set field in .env: `CONTROL3D_BLENDER_PATH=D:\Blender\blender.exe` (Please use Blender 5.1, as I'm not sure if version 4.x will work stably.)
