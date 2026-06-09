"use client";

import { useGameStore } from "@/store/gameStore";

export function DialogueSystem() {
  const activeNpcId = useGameStore((state) => state.activeDialogueNpcId);
  const node = useGameStore((state) => state.dialogueNode);
  const chooseOption = useGameStore((state) => state.chooseDialogueOption);
  const closeDialogue = useGameStore((state) => state.closeDialogue);

  if (!activeNpcId || !node) return null;

  return (
    <div className="dialogue-overlay">
      <div className="dialogue-card">
        <div className="dialogue-header">
          <div className="avatar-indicator" />
          <div>
            <h3>PATROL ROBOT</h3>
            <span className="subtitle-indicator">ONLINE SECURITY SYSTEM</span>
          </div>
        </div>
        
        <p className="dialogue-text">{node.text}</p>
        
        <div className="dialogue-options">
          {node.options.map((option, idx) => (
            <button
              key={idx}
              className="dialogue-button"
              onClick={() => chooseOption(option.nextNodeId)}
            >
              {option.text}
            </button>
          ))}
          
          <button className="dialogue-button close" onClick={closeDialogue}>
            Exit Dialogue
          </button>
        </div>
      </div>
    </div>
  );
}
