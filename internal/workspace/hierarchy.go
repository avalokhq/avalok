package workspace

type HierarchyTemplate struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Levels      []string `json:"levels"`
}

var Templates = map[string]HierarchyTemplate{
	"default": {
		Name:        "default",
		Description: "Workspace > Environment > Service",
		Levels:      []string{"workspace", "environment", "service"},
	},
	"service-first": {
		Name:        "service-first",
		Description: "Workspace > Service > Environment",
		Levels:      []string{"workspace", "service", "environment"},
	},
	"product-first": {
		Name:        "product-first",
		Description: "Product > Service > Environment",
		Levels:      []string{"product", "service", "environment"},
	},
	"company": {
		Name:        "company",
		Description: "Company > Product > Service > Environment",
		Levels:      []string{"company", "product", "service", "environment"},
	},
}

func ListTemplates() []HierarchyTemplate {
	result := make([]HierarchyTemplate, 0, len(Templates))
	for _, t := range Templates {
		result = append(result, t)
	}
	return result
}

func GetTemplate(name string) HierarchyTemplate {
	if t, ok := Templates[name]; ok {
		return t
	}
	return Templates["default"]
}
