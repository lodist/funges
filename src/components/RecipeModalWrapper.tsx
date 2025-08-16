import { RecipeModal } from './RecipeModal';
import { RecipeModalDesktop } from './RecipeModalDesktop';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Recipe } from '@/data/recipes';

interface RecipeModalWrapperProps {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecipeModalWrapper = ({
  recipe,
  isOpen,
  onClose,
}: RecipeModalWrapperProps) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <RecipeModal recipe={recipe} isOpen={isOpen} onClose={onClose} />;
  }

  return (
    <RecipeModalDesktop recipe={recipe} isOpen={isOpen} onClose={onClose} />
  );
};

export default RecipeModalWrapper;
