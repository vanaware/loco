// Adicione esta função no store.ts, junto com as demais funções de rede

export async function sendProfileUpdate(contactId: string, dc: RTCDataChannel) {
  const profileData = {
    type: "profile_update",
    displayName: myDisplayName.value,
    photo: appConfig.value.profilePhoto,
    timestamp: Date.now(),
  };
  
  try {
    dc.send(JSON.stringify({
      id: `profile_${Date.now()}`,
      from: myId.value!,
      to: contactId,
      text: JSON.stringify(profileData),
      timestamp: Date.now(),
      status: "delivered",
      channel: "p2p",
      type: "profile_update",
    }));
  } catch (e) {
    console.warn("Falha ao enviar profile update:", e);
  }
}
