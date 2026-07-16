// Domain Layer Port

interface FetchPortRequest {
  name: string;
}

type FetchPort = (request: FetchPortRequest) => Promise<string>;

// Application layer use case

interface UseCaseDependencies {
  fetchPort: FetchPort;
  request: FetchPortRequest;
}

interface PortError {}

type UseCase = (
  dependecies: UseCaseDependencies,
) => () => Promise<Result<string, PortError>>;

export const makeUseCase: UseCase = (dependencies) => async () => {
  dependencies.fetchPort(dependencies.request);
};
