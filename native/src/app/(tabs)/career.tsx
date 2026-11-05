import { ScrollView, StyleSheet } from 'react-native';
import { CareerExperience } from '../../components/CareerExperience';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';

export default function CareerScreen() {
  usePrivateScreenCapture('career');
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <CareerExperience variant="page" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#FFF8FA', padding: 16, paddingBottom: 30, gap: 18 },
});
