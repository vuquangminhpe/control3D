"use client";

import { useEffect } from "react";
import { useGameStore, weaponCatalog, type WeaponType } from "@/store/gameStore";

export function DialogueSystem() {
  const activeNpcId = useGameStore((state) => state.activeDialogueNpcId);
  const node = useGameStore((state) => state.dialogueNode);
  const chooseOption = useGameStore((state) => state.chooseDialogueOption);
  const closeDialogue = useGameStore((state) => state.closeDialogue);
  const score = useGameStore((state) => state.score);
  const ownedWeapons = useGameStore((state) => state.ownedWeapons);
  const selectedWeapon = useGameStore((state) => state.selectedWeapon);

  // Auto-advance delay nodes
  useEffect(() => {
    if (node && node.isDelay && node.nextNodeId) {
      const timer = setTimeout(() => {
        chooseOption(node.nextNodeId!);
      }, (node.delayDuration || 1) * 1000);
      return () => clearTimeout(timer);
    }
  }, [node, chooseOption]);

  if (!activeNpcId || !node) return null;

  return (
    <div className="dialogue-overlay">
      <div className="dialogue-card">
        <div className="dialogue-header">
          <div className="avatar-indicator" />
          <div>
            <h3>{node.speakerName || "PATROL ROBOT"}</h3>
            <span className="subtitle-indicator">{node.speakerSub || "ONLINE SECURITY SYSTEM"}</span>
          </div>
        </div>
        
        <p className="dialogue-text">{node.text}</p>

        {node.id === "shop" ? (
          <div className="shop-weapon-grid">
            {(Object.keys(weaponCatalog) as WeaponType[]).map((weapon) => {
              const catalog = weaponCatalog[weapon];
              const owned = ownedWeapons.includes(weapon);
              const equipped = selectedWeapon === weapon;
              const canBuy = score >= catalog.cost;
              return (
                <article className={`shop-weapon-card${equipped ? " equipped" : ""}`} key={weapon}>
                  <div>
                    <span>{catalog.label}</span>
                    <strong>{catalog.cost === 0 ? "Starter" : `${catalog.cost} score`}</strong>
                  </div>
                  <p>{catalog.description}</p>
                  <small>
                    {equipped ? "Equipped" : owned ? "Owned" : canBuy ? "Available" : "Need more score"}
                  </small>
                </article>
              );
            })}
          </div>
        ) : null}
        
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
          
          {!node.isDelay && (
            <button className="dialogue-button close" onClick={closeDialogue}>
              Exit Dialogue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
