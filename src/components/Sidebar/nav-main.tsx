'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setHtmlLanguage } from '@/lib/html-localization';

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
      icon?: LucideIcon;
    }[];
  }[];
}) {
  const location = useLocation();
  const { i18n } = useTranslation();

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
  ];

  const handleLanguageChange = (languageCode: string) => {
    setHtmlLanguage(languageCode);
    localStorage.setItem('language', languageCode);
  };

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map(item => {
          const isActive = location.pathname === item.url;

          // If item has no sub-items, render as a direct link
          if (!item.items || item.items.length === 0) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                >
                  <Link to={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          // If item has sub-items, render as collapsible
          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={isActive}
              className='group/collapsible'
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map(subItem => {
                      const isSubActive = location.pathname === subItem.url;

                      // Special handling for language switcher
                      if (subItem.url === '#language') {
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuSubButton>
                                  {subItem.icon && <subItem.icon />}
                                  <span>{subItem.title}</span>
                                </SidebarMenuSubButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align='start'
                                className='ml-2'
                              >
                                {languages.map(language => (
                                  <DropdownMenuItem
                                    key={language.code}
                                    onClick={() =>
                                      handleLanguageChange(language.code)
                                    }
                                    className={`flex items-center gap-2 ${
                                      i18n.language === language.code
                                        ? 'bg-accent'
                                        : ''
                                    }`}
                                  >
                                    <span className='text-lg'>
                                      {language.flag}
                                    </span>
                                    <span>{language.name}</span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuSubItem>
                        );
                      }

                      // Regular link items
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton asChild isActive={isSubActive}>
                            <Link to={subItem.url}>
                              {subItem.icon && <subItem.icon />}
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
