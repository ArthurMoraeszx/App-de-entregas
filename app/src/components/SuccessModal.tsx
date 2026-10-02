
import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import Button from './Button';

interface SuccessModalProps {
    visible: boolean;
    title?: string;
    message: string;
    buttonText?: string;
    onClose: () => void;
}


export default function SuccessModal({
    visible,
    title = 'Sucesso!',
    message,
    buttonText = 'OK',
    onClose
}: SuccessModalProps) {
    const { width } = useWindowDimensions();
    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.iconContainer}>
                        <CheckCircle color={Colors.white} size={48} />
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>

                    <Button
                        title={buttonText}
                        onPress={onClose}
                        variant="success"
                        style={styles.button}
                    />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.success,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
        marginTop: 0,
    },
    title: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: Typography.base,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: Spacing.xl,
        lineHeight: 24,
    },
    button: {
        width: '100%',
    }
});
