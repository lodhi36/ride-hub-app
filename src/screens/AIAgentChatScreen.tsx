import React from 'react';
import AIAgentChatModal from '../components/AIAgentChatModal';

const AIAgentChatScreen = ({ navigation, route }: any) => {
  const userRole = route?.params?.role || 'customer';
  const activeOrder = route?.params?.activeOrder || null;

  return (
    <AIAgentChatModal
      visible={true}
      onClose={() => navigation.goBack()}
      userRole={userRole}
      activeOrder={activeOrder}
    />
  );
};

export default AIAgentChatScreen;
