import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';
import { backTransitionRequest } from '../../navigation/backTransitionRequest';
import styles from './BackLink.module.css';

/** The way back from a pushed screen: a chevron and the name of the screen it returns to. */
export function BackLink({ to, label }: { readonly to: string; readonly label: string }) {
  return (
    <Link to={to} className={styles.link} onClick={() => backTransitionRequest.mark()}>
      <ChevronLeft size={20} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
