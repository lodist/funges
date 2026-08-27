import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecipesData, type Recipe } from '@/data/recipes';
import SEO from '@/components/SEO';
import { Route as RecipesRoute } from '@/routes/recipes';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Clock, Users, ChefHat, Filter } from '@/lib/icons';
import { RecipeModalWrapper } from '@/components';
import FilterModal from '@/components/FilterModal';
import { getRecipeImage } from '@/lib/utils';

export default function RecipesPage() {
  const { t } = useTranslation('recipes');
  const { q } = RecipesRoute.useSearch();
  const recipes = useRecipesData();
  const [searchQuery, setSearchQuery] = useState(q ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Get unique categories from species data
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    recipes.forEach(recipe => {
      recipe.species.forEach(species => {
        // Map species to categories (this would ideally come from species data)
        if (
          [
            'chant',
            'morel',
            'mushroom',
            'oyster-mushroom',
            'shiitake',
            'black_chant',
            'parasol',
            'st_george',
          ].includes(species)
        ) {
          categorySet.add('mushroom');
        } else if (
          [
            'elderberry',
            'blackberry',
            'raspberry',
            'blueberry',
            'strawberry',
            'lingonb',
          ].includes(species)
        ) {
          categorySet.add('berry');
        } else if (
          [
            'nettle',
            'garlic',
            'dandelion',
            'wild-mint',
            'chickweed',
            'plantain',
            'sorrel',
            'artichoke',
            'asparagus',
          ].includes(species)
        ) {
          categorySet.add('plant');
        } else if (['hazelnut', 'walnut', 'chestnut'].includes(species)) {
          categorySet.add('nut');
        }
      });
    });
    return Array.from(categorySet).sort();
  }, [recipes]);

  // Get unique difficulties
  const difficulties = useMemo(() => {
    const difficultySet = new Set<string>();
    recipes.forEach(recipe => {
      difficultySet.add(recipe.difficulty);
    });
    return Array.from(difficultySet).sort();
  }, [recipes]);

  // Get unique tags
  const tags = useMemo(() => {
    const tagSet = new Set<string>();
    recipes.forEach(recipe => {
      recipe.tags.forEach(tag => {
        tagSet.add(tag);
      });
    });
    return Array.from(tagSet).sort();
  }, [recipes]);

  // Filter recipes based on search query and category
  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      const matchesSearch =
        searchQuery === '' ||
        recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        recipe.tags.some(tag =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        recipe.ingredients.some(ingredient =>
          ingredient.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchesCategory =
        selectedCategory === 'all' ||
        recipe.species.some(species => {
          if (selectedCategory === 'mushroom') {
            return [
              'chant',
              'morel',
              'mushroom',
              'oyster-mushroom',
              'shiitake',
              'black_chant',
              'parasol',
              'st_george',
            ].includes(species);
          } else if (selectedCategory === 'berry') {
            return [
              'elderberry',
              'blackberry',
              'raspberry',
              'blueberry',
              'strawberry',
              'lingonb',
            ].includes(species);
          } else if (selectedCategory === 'plant') {
            return [
              'nettle',
              'garlic',
              'dandelion',
              'wild-mint',
              'chickweed',
              'plantain',
              'sorrel',
              'artichoke',
              'asparagus',
            ].includes(species);
          } else if (selectedCategory === 'nut') {
            return ['hazelnut', 'walnut', 'chestnut'].includes(species);
          }
          return false;
        });

      const matchesDifficulty =
        selectedDifficulty === 'all' ||
        recipe.difficulty === selectedDifficulty;

      const matchesTag =
        selectedTag === 'all' || recipe.tags.includes(selectedTag);

      return (
        matchesSearch && matchesCategory && matchesDifficulty && matchesTag
      );
    });
  }, [recipes, searchQuery, selectedCategory, selectedDifficulty, selectedTag]);

  useEffect(() => {
    setSearchQuery(q ?? '');
  }, [q]);

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}recipes`}
      />
      <div className='recipes-page max-w-7xl mx-auto px-4 py-8'>
        {/* Header */}
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold text-foreground mb-4'>
            {t('title')}
          </h1>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            {t('description')}
          </p>
        </div>

        {/* Search and Filters */}
        <div className='mb-8 space-y-4'>
          <div className='flex flex-col sm:flex-row gap-4'>
            {/* Search Input */}
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
              <Input
                placeholder={t('search.placeholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className='pl-10'
              />
            </div>

            {/* Filter Button */}
            <Button
              onClick={() => setIsFilterModalOpen(true)}
              className='w-full sm:w-48'
            >
              <span className='flex items-center gap-2'>
                <Filter className='h-4 w-4' />
                <span>{t('filters')}</span>
                {/* Active filters indicator */}
                {(selectedCategory !== 'all' ||
                  selectedDifficulty !== 'all' ||
                  selectedTag !== 'all') && (
                  <Badge variant='secondary'>
                    {(selectedCategory !== 'all' ? 1 : 0) +
                      (selectedDifficulty !== 'all' ? 1 : 0) +
                      (selectedTag !== 'all' ? 1 : 0)}
                  </Badge>
                )}
              </span>
            </Button>
          </div>
        </div>

        {/* Recipes Grid */}
        {filteredRecipes.length === 0 ? (
          <div className='text-center py-12'>
            <ChefHat className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
            <h3 className='text-lg font-medium text-foreground mb-2'>
              {t('search.no_results')}
            </h3>
            <p className='text-muted-foreground'>{t('search.try_adjusting')}</p>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {filteredRecipes.map(recipe => {
              const recipeImage = getRecipeImage(recipe.id);

              return (
                <Card key={recipe.id} className='h-full'>
                  <CardHeader className='pb-3'>
                    {/* Mobile: Image on top, then title */}
                    <div className='block md:hidden'>
                      {/* Recipe Image for mobile - above title */}
                      {recipeImage && (
                        <div className='mb-4'>
                          <div className='relative w-full aspect-square bg-secondary overflow-hidden rounded-lg'>
                            <img
                              src={recipeImage}
                              alt={recipe.title}
                              className='w-full h-full object-cover object-center'
                              loading='lazy'
                            />
                            <div className='absolute inset-0 bg-black/10' />

                            {/* Title overlay at bottom */}
                            <div className='absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-4'>
                              <CardTitle className='text-lg line-clamp-2 text-white'>
                                {recipe.title}
                              </CardTitle>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Title for mobile - only show if no image */}
                      {!recipeImage && (
                        <CardTitle className='text-lg line-clamp-2 mb-2'>
                          {recipe.title}
                        </CardTitle>
                      )}

                      {/* Recipe Stats for mobile */}
                      <div className='flex items-center gap-4 text-sm text-muted-foreground mb-2'>
                        <div className='flex items-center gap-1'>
                          <Clock className='h-4 w-4' />
                          <span>{recipe.prepTime}</span>
                        </div>
                        <div className='flex items-center gap-1'>
                          <Users className='h-4 w-4' />
                          <span>{recipe.servings}</span>
                        </div>
                      </div>

                      <CardDescription className='line-clamp-2'>
                        {recipe.ingredients.slice(0, 3).join(', ')}...
                      </CardDescription>
                    </div>

                    {/* Desktop: Image on left, title and difficulty on right */}
                    <div className='hidden md:flex items-start gap-4'>
                      {/* Recipe Image */}
                      {recipeImage && (
                        <div className='flex-shrink-0'>
                          <div className='relative w-35 h-35 bg-secondary overflow-hidden rounded-lg'>
                            <img
                              src={recipeImage}
                              alt={recipe.title}
                              className='w-full h-full object-cover object-center'
                              loading='lazy'
                            />
                            <div className='absolute inset-0 bg-black/10' />
                          </div>
                        </div>
                      )}

                      {/* Title and Difficulty */}
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-start justify-between'>
                          <CardTitle className='text-lg line-clamp-2 flex-1'>
                            {recipe.title}
                          </CardTitle>
                        </div>

                        {/* Recipe Stats for desktop */}
                        <div className='flex items-center gap-4 text-sm text-muted-foreground my-2'>
                          <div className='flex items-center gap-1'>
                            <Clock className='h-4 w-4' />
                            <span>{recipe.prepTime}</span>
                          </div>
                          <div className='flex items-center gap-1'>
                            <Users className='h-4 w-4' />
                            <span>{recipe.servings}</span>
                          </div>
                        </div>

                        <CardDescription className='line-clamp-2'>
                          {recipe.ingredients.slice(0, 3).join(', ')}...
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className='flex-1 flex flex-col'>
                    {/* Tags */}
                    <div className='flex flex-wrap gap-1 mb-4'>
                      {recipe.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant='secondary'>
                          {t(`tags.${tag}`)}
                        </Badge>
                      ))}
                      {recipe.tags.length > 3 && (
                        <Badge variant='secondary'>
                          +{recipe.tags.length - 3} {t('more')}
                        </Badge>
                      )}
                    </div>

                    {/* Species */}
                    <div className='flex flex-wrap gap-1 mb-4'>
                      {recipe.species.map(species => (
                        <Badge key={species} variant='outline'>
                          {t(`species.${species}`)}
                        </Badge>
                      ))}
                    </div>

                    {/* View Recipe Button */}
                    <Button
                      className='mt-auto'
                      onClick={() => setSelectedRecipe(recipe)}
                    >
                      {t('view_recipe')}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <RecipeModalWrapper
          recipe={selectedRecipe}
          isOpen={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />

        {/* Filter Modal */}
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          categories={categories}
          difficulties={difficulties}
          tags={tags}
          selectedCategory={selectedCategory}
          selectedDifficulty={selectedDifficulty}
          selectedTag={selectedTag}
          onCategoryChange={setSelectedCategory}
          onDifficultyChange={setSelectedDifficulty}
          onTagChange={setSelectedTag}
          onClearFilters={() => {
            setSearchQuery('');
            setSelectedCategory('all');
            setSelectedDifficulty('all');
            setSelectedTag('all');
          }}
        />
      </div>
    </>
  );
}
