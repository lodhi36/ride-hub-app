import React, { useContext, useState } from 'react';
import { TextInput, View, Text, TextInputProps, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemeContext } from '../context/ThemeContext';
import { colors, shadows } from '../theme/colors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  isFocusedProp?: boolean;
}

const Input = ({ label, error, style, secureTextEntry, onFocus, onBlur, isFocusedProp, ...props }: InputProps) => {
  const { theme } = useContext(ThemeContext);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [internalFocused, setInternalFocused] = useState(false);
  const isFocused = isFocusedProp !== undefined ? isFocusedProp : internalFocused;
  const isDark = theme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  const labelColor = isDark ? currentColors.secondaryText : colors.light.textMuted;
  const bgColor = isDark ? currentColors.inputBackground : colors.light.grayBg;
  const textColor = isDark ? currentColors.primaryText : colors.black;
  const normalBorderColor = isDark ? currentColors.border : colors.light.border;
  const activeBorderColor = error ? '#EF4444' : colors.primary; // Pink line only on active
  const inactiveBorderColor = error ? '#EF4444' : normalBorderColor;
  const borderColor = isFocused ? activeBorderColor : inactiveBorderColor;
  
  const isPasswordField = secureTextEntry !== undefined && secureTextEntry !== false;
  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            {
              color: textColor,
              backgroundColor: bgColor,
              borderColor: activeBorderColor,
            },
            isPasswordField && { paddingRight: 45 },
            style,
          ]}
          placeholderTextColor={currentColors.placeholder}
          secureTextEntry={isPasswordField ? !isPasswordVisible : false}
          onFocus={(e) => {
            setInternalFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setInternalFocused(false);
            if (onBlur) onBlur(e);
          }}
          {...props}
        />
        {isPasswordField ? (
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18 }}>{isPasswordVisible ? '👁️' : '🙈'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
    fontSize: 14,
  },
  inputWrapper: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 16,
  },
  eyeIcon: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  errorText: {
    marginTop: 4,
    color: '#EF4444',
    fontSize: 14,
  },
});

export default Input;
