# control3D

Monorepo for the 3D Object Management MVP.

## Quick start

1. Install dependencies:
   - `yarn install`

2. Start app:
   - `yarn dev`
   - Open `http://localhost:8878`

3. Local database:
   - SQLite file is created automatically at:
     `apps/web/data/control3d.sqlite`

4. Local uploads:
   - Uploaded model files are stored under:
     `apps/web/public/uploads/models`

5. Download "Blender":
   - Important and create `.env.local`
   - Set field in `.env`:
     `CONTROL3D_BLENDER_PATH=D:\Blender\blender.exe`
   - Please use Blender 5.1, as I'm not sure if version 4.x will work stably.

6. Bug and update plant:
   - Additional development will be needed for story handling, especially the if/else logic in the map connections between characters (Need to add preview check actions in the story to increase interactivity and improve processing).
   - I will remove auto-rigs in the future because it's not as well-developed as Mixamo; I'm just labeling that part as "research +" instead of "production".
   - Processing productions should still be done on Mixamo, which would be more logical.
   - Handling lighting angles, etc., should still be left to specialized software like Blender, instead of applying it to FE because it's not good enough.
